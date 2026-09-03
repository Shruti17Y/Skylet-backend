const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Apply verifyToken and verifyAdmin middleware to ALL /api/admin routes
router.use(verifyToken, verifyAdmin);

// Helper function to record audit logs
const logAuditAction = async (userId, action, entityType, entityId, description) => {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId, description]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

// -------------------------------------------------------------
// 1. DASHBOARD & STATISTICS
// -------------------------------------------------------------
router.get('/dashboard/stats', async (req, res, next) => {
  try {
    const statsResult = await db.query(`
      SELECT 
        (SELECT COUNT(*)::int FROM orders) AS total_orders,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'Pending Admin Approval') AS pending_approval,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'Department Processing') AS in_process,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'Ready for Packing') AS ready_packing,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'Ready for Dispatch') AS ready_dispatch,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'Ready for Billing') AS ready_billing,
        (SELECT COUNT(*)::int FROM orders WHERE status = 'Completed') AS completed,
        (SELECT COUNT(*)::int FROM users WHERE role_id = 1 AND is_active = true) AS total_users,
        (SELECT COUNT(*)::int FROM products WHERE is_active = true) AS total_products
    `);

    return res.json({
      success: true,
      stats: statsResult.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// -------------------------------------------------------------
// 2. ORDER MANAGEMENT & APPROVAL WORKFLOW
// -------------------------------------------------------------

// GET /api/admin/orders - All orders with filters
router.get('/orders', async (req, res, next) => {
  try {
    const { search, status, payment_status, date_from, date_to } = req.query;

    let queryText = `
      SELECT o.id, o.serial_number, o.transport_name, o.total_amount,
             o.status, o.payment_status, o.created_at,
             u.full_name AS customer_name, u.email AS customer_email, u.state AS customer_state
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'All') {
      params.push(status);
      queryText += ` AND o.status = $${params.length}`;
    }

    if (payment_status && payment_status !== 'All') {
      params.push(payment_status);
      queryText += ` AND o.payment_status = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      queryText += ` AND (o.serial_number ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR o.transport_name ILIKE $${params.length})`;
    }

    queryText += ` ORDER BY o.created_at DESC`;

    const result = await db.query(queryText, params);

    return res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/orders/:id - Single order detail
router.get('/orders/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const orderResult = await db.query(
      `SELECT o.id, o.serial_number, o.user_id, o.transport_name, o.total_amount,
              o.status, o.payment_status, o.payment_proof, o.rejection_reason,
              o.approved_at, o.created_at,
              u.full_name AS customer_name, u.email AS customer_email,
              u.whatsapp_number AS customer_whatsapp, u.state AS customer_state
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orderResult.rows[0];

    // Fetch line items
    const itemsResult = await db.query(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.category_name, oi.quantity, oi.unit_price, oi.total_price,
              p.department_id, d.name AS department_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN departments d ON p.department_id = d.id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [id]
    );

    // Fetch department breakdown
    const deptsResult = await db.query(
      `SELECT odi.id, odi.department_id, d.name AS department_name, odi.ordered_quantity,
              odi.completed_quantity, odi.remaining_quantity, odi.status, odi.employee_message
       FROM order_department_items odi
       JOIN departments d ON odi.department_id = d.id
       WHERE odi.order_id = $1
       ORDER BY odi.id ASC`,
      [id]
    );

    // Fetch communication messages
    const messagesResult = await db.query(
      `SELECT om.id, om.message, om.created_at, u.full_name AS sender_name, d.name AS department_name
       FROM order_messages om
       JOIN users u ON om.sender_id = u.id
       LEFT JOIN departments d ON om.department_id = d.id
       WHERE om.order_id = $1
       ORDER BY om.created_at ASC`,
      [id]
    );

    return res.json({
      success: true,
      order: {
        ...order,
        total_amount: parseFloat(order.total_amount),
        items: itemsResult.rows.map((it) => ({
          ...it,
          unit_price: parseFloat(it.unit_price),
          total_price: parseFloat(it.total_price),
        })),
        department_items: deptsResult.rows,
        messages: messagesResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/orders/:id/approve - Approve order & distribute to departments
router.patch('/orders/:id/approve', async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Fetch order
    const orderRes = await client.query(`SELECT id, serial_number, user_id, total_amount, status FROM orders WHERE id = $1`, [id]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orderRes.rows[0];

    // Generate or confirm serial number (e.g. SR1001)
    let serialNumber = order.serial_number;
    if (!serialNumber) {
      const seqRes = await client.query(`SELECT prefix, next_number FROM serial_number_settings WHERE id = 1 FOR UPDATE`);
      const settings = seqRes.rows[0] || { prefix: 'SR', next_number: 1001 };
      serialNumber = `${settings.prefix}${settings.next_number}`;

      await client.query(`UPDATE serial_number_settings SET next_number = next_number + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`);
    }

    // Update order status to Approved / Department Processing
    await client.query(
      `UPDATE orders 
       SET status = 'Department Processing', serial_number = $1, approved_by = $2, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [serialNumber, req.user.id, id]
    );

    // Fetch order items and distribute to order_department_items
    const itemsRes = await client.query(
      `SELECT oi.id, oi.product_id, oi.quantity, p.department_id
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [id]
    );

    for (const item of itemsRes.rows) {
      if (item.department_id) {
        await client.query(
          `INSERT INTO order_department_items (order_id, department_id, product_id, ordered_quantity, completed_quantity, remaining_quantity, status)
           VALUES ($1, $2, $3, $4, 0, $4, 'Pending')`,
          [id, item.department_id, item.product_id, item.quantity]
        );
      }
    }

    // Notify Customer
    await client.query(
      `INSERT INTO notifications (user_id, title, message, link)
       VALUES ($1, $2, $3, $4)`,
      [
        order.user_id,
        `Order ${serialNumber} Approved`,
        `Your order ${serialNumber} has been approved by Admin and distributed to department production.`,
        `/orders/${id}`,
      ]
    );

    await client.query('COMMIT');

    await logAuditAction(req.user.id, 'APPROVE_ORDER', 'ORDER', id, `Approved order ${serialNumber} and distributed items to production departments.`);

    return res.json({
      success: true,
      message: `Order ${serialNumber} approved and distributed to departments successfully.`,
      serial_number: serialNumber,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// PATCH /api/admin/orders/:id/reject - Reject order with reason
router.patch('/orders/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const orderRes = await db.query(`SELECT id, serial_number, user_id FROM orders WHERE id = $1`, [id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = orderRes.rows[0];

    await db.query(
      `UPDATE orders
       SET status = 'Rejected', rejection_reason = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [reason.trim(), id]
    );

    // Notify customer
    await db.query(
      `INSERT INTO notifications (user_id, title, message, link)
       VALUES ($1, $2, $3, $4)`,
      [
        order.user_id,
        `Order ${order.serial_number || '#' + id} Rejected`,
        `Your order was not approved. Reason: ${reason.trim()}`,
        `/orders/${id}`,
      ]
    );

    await logAuditAction(req.user.id, 'REJECT_ORDER', 'ORDER', id, `Rejected order #${id}. Reason: ${reason.trim()}`);

    return res.json({
      success: true,
      message: 'Order rejected successfully.',
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/orders/:id/price - Review and update unit price before approval
router.patch('/orders/:id/price', async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { id } = req.params;
    const { item_id, unit_price } = req.body;

    if (!item_id || unit_price === undefined || parseFloat(unit_price) < 0) {
      return res.status(400).json({ success: false, message: 'Valid item ID and unit price required.' });
    }

    const newUnitPrice = parseFloat(unit_price);

    await client.query('BEGIN');

    // Fetch order item
    const itemRes = await client.query(`SELECT quantity FROM order_items WHERE id = $1 AND order_id = $2`, [item_id, id]);
    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order item not found.' });
    }

    const qty = parseInt(itemRes.rows[0].quantity, 10);
    const newTotalPrice = parseFloat((qty * newUnitPrice).toFixed(2));

    await client.query(
      `UPDATE order_items SET unit_price = $1, total_price = $2 WHERE id = $3`,
      [newUnitPrice, newTotalPrice, item_id]
    );

    // Recalculate order total amount
    const sumRes = await client.query(`SELECT SUM(total_price) AS sum_total FROM order_items WHERE order_id = $1`, [id]);
    const newOrderTotal = parseFloat(sumRes.rows[0].sum_total || 0);

    await client.query(`UPDATE orders SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newOrderTotal, id]);

    await client.query('COMMIT');

    await logAuditAction(req.user.id, 'UPDATE_ORDER_PRICE', 'ORDER', id, `Updated unit price for item #${item_id} to ₹${newUnitPrice}. New Total: ₹${newOrderTotal}`);

    return res.json({
      success: true,
      message: 'Order item price updated successfully.',
      total_amount: newOrderTotal,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------
// 3. PRODUCT MANAGEMENT & SCHEDULED LIVE DATES
// -------------------------------------------------------------

// GET /api/admin/products - All products with department info
router.get('/products', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT p.id, p.category_id, c.name AS category_name,
             p.department_id, d.name AS department_name,
             p.name, p.description, p.main_image, p.view_details_image,
             p.minimum_order_quantity, p.price, p.live_from_date,
             p.status, p.is_active, p.created_at
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN departments d ON p.department_id = d.id
      ORDER BY p.id ASC
    `);

    return res.json({
      success: true,
      products: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/products - Create new product
router.post('/products', upload.fields([{ name: 'main_image', maxCount: 1 }, { name: 'view_details_image', maxCount: 1 }]), async (req, res, next) => {
  try {
    const { name, description, category_id, department_id, minimum_order_quantity, price, live_from_date, status } = req.body;

    if (!name || !name.trim() || !category_id || !minimum_order_quantity || !price) {
      return res.status(400).json({ success: false, message: 'Name, Category, MOQ, and Price are required.' });
    }

    const mainImg = req.files && req.files['main_image'] ? `/uploads/${req.files['main_image'][0].filename}` : 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80';
    const detailImg = req.files && req.files['view_details_image'] ? `/uploads/${req.files['view_details_image'][0].filename}` : mainImg;

    const liveDate = live_from_date ? new Date(live_from_date) : new Date();
    const prodStatus = status || (liveDate > new Date() ? 'scheduled' : 'active');

    const result = await db.query(
      `INSERT INTO products (category_id, department_id, name, description, main_image, view_details_image, minimum_order_quantity, price, live_from_date, status, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
       RETURNING id, name, status, live_from_date`,
      [
        parseInt(category_id, 10),
        department_id ? parseInt(department_id, 10) : null,
        name.trim(),
        description ? description.trim() : '',
        mainImg,
        detailImg,
        parseInt(minimum_order_quantity, 10),
        parseFloat(price),
        liveDate,
        prodStatus,
      ]
    );

    await logAuditAction(req.user.id, 'CREATE_PRODUCT', 'PRODUCT', result.rows[0].id, `Created product "${name.trim()}" in category ID ${category_id}`);

    return res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      product: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/products/:id - Edit product
router.patch('/products/:id', upload.fields([{ name: 'main_image', maxCount: 1 }, { name: 'view_details_image', maxCount: 1 }]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, category_id, department_id, minimum_order_quantity, price, live_from_date, status, is_active } = req.body;

    const prodRes = await db.query(`SELECT * FROM products WHERE id = $1`, [id]);
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const cur = prodRes.rows[0];

    const mainImg = req.files && req.files['main_image'] ? `/uploads/${req.files['main_image'][0].filename}` : cur.main_image;
    const detailImg = req.files && req.files['view_details_image'] ? `/uploads/${req.files['view_details_image'][0].filename}` : cur.view_details_image;

    const liveDate = live_from_date ? new Date(live_from_date) : cur.live_from_date;
    const prodStatus = status || cur.status;

    await db.query(
      `UPDATE products
       SET name = $1, description = $2, category_id = $3, department_id = $4,
           minimum_order_quantity = $5, price = $6, main_image = $7, view_details_image = $8,
           live_from_date = $9, status = $10, is_active = $11, updated_at = CURRENT_TIMESTAMP
       WHERE id = $12`,
      [
        name ? name.trim() : cur.name,
        description !== undefined ? description.trim() : cur.description,
        category_id ? parseInt(category_id, 10) : cur.category_id,
        department_id ? parseInt(department_id, 10) : cur.department_id,
        minimum_order_quantity ? parseInt(minimum_order_quantity, 10) : cur.minimum_order_quantity,
        price !== undefined ? parseFloat(price) : cur.price,
        mainImg,
        detailImg,
        liveDate,
        prodStatus,
        is_active !== undefined ? is_active : cur.is_active,
        id,
      ]
    );

    await logAuditAction(req.user.id, 'UPDATE_PRODUCT', 'PRODUCT', id, `Updated product specs for #${id}`);

    return res.json({ success: true, message: 'Product updated successfully.' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/products/:id - Soft delete/deactivate
router.delete('/products/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query(`UPDATE products SET is_active = false, status = 'inactive' WHERE id = $1`, [id]);
    await logAuditAction(req.user.id, 'DEACTIVATE_PRODUCT', 'PRODUCT', id, `Deactivated product #${id}`);
    return res.json({ success: true, message: 'Product deactivated.' });
  } catch (error) {
    next(error);
  }
});

// -------------------------------------------------------------
// 4. USER & DEPARTMENT ACCOUNT MANAGEMENT
// -------------------------------------------------------------

// GET /api/admin/users - Customer accounts
router.get('/users', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT id, full_name, email, birth_date, state, whatsapp_number, is_active, created_at
      FROM users
      WHERE role_id = 1
      ORDER BY created_at DESC
    `);

    return res.json({ success: true, count: result.rows.length, users: result.rows });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/users/:id/status - Activate / Deactivate customer
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    await db.query(`UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [is_active, id]);
    await logAuditAction(req.user.id, 'TOGGLE_USER_STATUS', 'USER', id, `Set customer #${id} active state to ${is_active}`);

    return res.json({ success: true, message: `User active status updated to ${is_active}.` });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/department-accounts - Internal Accounts
router.get('/department-accounts', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.full_name, u.email, u.role_id, r.name AS role_name,
             u.department_id, d.name AS department_name, u.is_active, u.created_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role_id > 1 AND u.role_id != 2
      ORDER BY u.id ASC
    `);

    return res.json({ success: true, count: result.rows.length, accounts: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/department-accounts - Create Department Account
router.post('/department-accounts', async (req, res, next) => {
  try {
    const { full_name, email, password, role_id, department_id } = req.body;

    if (!full_name || !email || !password || !role_id || !department_id) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await db.query(
      `INSERT INTO users (role_id, department_id, full_name, email, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, full_name, email`,
      [parseInt(role_id, 10), parseInt(department_id, 10), full_name.trim(), email.trim().toLowerCase(), passwordHash]
    );

    await logAuditAction(req.user.id, 'CREATE_DEPT_ACCOUNT', 'USER', result.rows[0].id, `Created department account for ${full_name}`);

    return res.status(201).json({ success: true, message: 'Department account created.', account: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/department-accounts/:id/status - Toggle department active state
router.patch('/department-accounts/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    await db.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [is_active, id]);
    await logAuditAction(req.user.id, 'TOGGLE_DEPT_STATUS', 'USER', id, `Updated department account #${id} active to ${is_active}`);

    return res.json({ success: true, message: `Department account status updated.` });
  } catch (error) {
    next(error);
  }
});

// -------------------------------------------------------------
// 5. LIVE DEPARTMENTS MONITORING
// -------------------------------------------------------------
router.get('/departments/live-status', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT d.id, d.name AS department_name,
             COUNT(odi.id) FILTER (WHERE odi.status != 'Completed')::int AS active_orders_count,
             COUNT(odi.id) FILTER (WHERE odi.status = 'Ready for Packing')::int AS ready_count
      FROM departments d
      LEFT JOIN order_department_items odi ON d.id = odi.department_id
      WHERE d.is_active = true
      GROUP BY d.id
      ORDER BY d.id ASC
    `);

    return res.json({ success: true, departments: result.rows });
  } catch (error) {
    next(error);
  }
});

// -------------------------------------------------------------
// 6. PAYMENT SETTINGS, CATALOG, OFFERS, NOTIFICATIONS & AUDIT
// -------------------------------------------------------------

// GET / PATCH Payment Settings
router.get('/payment-settings', async (req, res, next) => {
  try {
    const result = await db.query(`SELECT * FROM company_settings LIMIT 1`);
    return res.json({ success: true, settings: result.rows[0] || {} });
  } catch (error) {
    next(error);
  }
});

router.patch('/payment-settings', upload.single('qr_code_image'), async (req, res, next) => {
  try {
    const { bank_name, account_name, account_number, ifsc_code, upi_id, support_phone } = req.body;
    let qrPath = undefined;
    if (req.file) qrPath = `/uploads/${req.file.filename}`;

    const cur = (await db.query(`SELECT * FROM company_settings LIMIT 1`)).rows[0] || {};

    await db.query(
      `UPDATE company_settings
       SET bank_name = $1, account_name = $2, account_number = $3, ifsc_code = $4,
           upi_id = $5, support_phone = $6, qr_code_image = COALESCE($7, qr_code_image), updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        bank_name || cur.bank_name,
        account_name || cur.account_name,
        account_number || cur.account_number,
        ifsc_code || cur.ifsc_code,
        upi_id || cur.upi_id,
        support_phone || cur.support_phone,
        qrPath || null,
      ]
    );

    await logAuditAction(req.user.id, 'UPDATE_PAYMENT_SETTINGS', 'COMPANY', 1, 'Updated company bank and payment details.');

    return res.json({ success: true, message: 'Payment settings updated successfully.' });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/audit-logs
router.get('/audit-logs', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT al.id, al.action, al.entity_type, al.entity_id, al.description, al.created_at,
             u.full_name AS user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 100
    `);

    return res.json({ success: true, audit_logs: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
