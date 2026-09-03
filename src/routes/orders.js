const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// POST /api/orders - Create a new order
router.post('/', verifyToken, upload.single('payment_proof'), async (req, res, next) => {
  const client = await db.pool.connect();
  try {
    const { transport_name } = req.body;

    // Transport Name is REQUIRED
    if (!transport_name || !transport_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Transport Name is required to place an order.',
      });
    }

    let paymentProofUrl = null;
    if (req.file) {
      paymentProofUrl = `/uploads/${req.file.filename}`;
    }

    await client.query('BEGIN');

    // Fetch user cart
    const cartResult = await client.query('SELECT id FROM carts WHERE user_id = $1', [req.user.id]);
    if (cartResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }

    const cartId = cartResult.rows[0].id;

    // Fetch cart items with current product price and category
    const cartItemsResult = await client.query(
      `SELECT ci.quantity, p.id AS product_id, p.name AS product_name,
              p.price, p.minimum_order_quantity, p.is_active, p.live_from_date,
              c.name AS category_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       WHERE ci.cart_id = $1`,
      [cartId]
    );

    if (cartItemsResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Your cart is empty. Add products before placing an order.' });
    }

    const cartItems = cartItemsResult.rows;

    // Verify all products are live, active, and meet MOQ
    let totalAmount = 0;
    const categoriesInOrder = new Set();

    for (const item of cartItems) {
      const qty = parseInt(item.quantity, 10);
      const moq = parseInt(item.minimum_order_quantity, 10);

      if (!item.is_active || new Date(item.live_from_date) > new Date()) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Product "${item.product_name}" is no longer available.`,
        });
      }

      if (qty < moq) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Minimum order quantity for "${item.product_name}" is ${moq}.`,
        });
      }

      const unitPrice = parseFloat(item.price);
      const itemTotal = qty * unitPrice;
      totalAmount += itemTotal;

      categoriesInOrder.add(item.category_name);
    }

    // Insert order record
    const orderInsertResult = await client.query(
      `INSERT INTO orders (user_id, transport_name, total_amount, status, payment_status, payment_proof)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        req.user.id,
        transport_name.trim(),
        parseFloat(totalAmount.toFixed(2)),
        'Pending Admin Approval',
        paymentProofUrl ? 'Proof Uploaded' : 'Pending Payment Proof',
        paymentProofUrl,
      ]
    );

    const orderId = orderInsertResult.rows[0].id;

    // Generate Serial Number e.g. SR1001
    const serialNumber = `SR${1000 + orderId}`;
    await client.query(`UPDATE orders SET serial_number = $1 WHERE id = $2`, [serialNumber, orderId]);

    // Insert order items freezing name, category, and unit price
    for (const item of cartItems) {
      const qty = parseInt(item.quantity, 10);
      const unitPrice = parseFloat(item.price);
      const itemTotal = parseFloat((qty * unitPrice).toFixed(2));

      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, category_name, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, item.product_id, item.product_name, item.category_name, qty, unitPrice, itemTotal]
      );
    }

    // Insert default department statuses for departments in order + R&D Testing + Dispatch
    const deptList = Array.from(categoriesInOrder);
    if (!deptList.includes('R&D Testing')) deptList.push('R&D Testing');

    for (const dept of deptList) {
      await client.query(
        `INSERT INTO order_department_statuses (order_id, department_name, status)
         VALUES ($1, $2, $3) ON CONFLICT (order_id, department_name) DO NOTHING`,
        [orderId, dept, 'Pending']
      );
    }

    // Clear cart
    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);

    // Insert notification
    await client.query(
      `INSERT INTO notifications (user_id, title, message, link)
       VALUES ($1, $2, $3, $4)`,
      [
        req.user.id,
        `Order ${serialNumber} Submitted`,
        `Your order ${serialNumber} of ₹${totalAmount.toLocaleString('en-IN')} has been submitted and is waiting for approval.`,
        `/orders/${orderId}`,
      ]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      order: {
        id: orderId,
        serial_number: serialNumber,
        total_amount: parseFloat(totalAmount.toFixed(2)),
        transport_name: transport_name.trim(),
        status: 'Pending Admin Approval',
        created_at: orderInsertResult.rows[0].created_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// POST /api/orders/:id/payment-proof - Upload payment proof for existing order
router.post('/:id/payment-proof', verifyToken, upload.single('payment_proof'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select a payment proof file to upload.' });
    }

    const proofUrl = `/uploads/${req.file.filename}`;

    // Verify order ownership
    const orderResult = await db.query(`SELECT id, user_id FROM orders WHERE id = $1`, [id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    if (orderResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access forbidden.' });
    }

    await db.query(
      `UPDATE orders SET payment_proof = $1, payment_status = 'Proof Uploaded', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [proofUrl, id]
    );

    return res.json({
      success: true,
      message: 'Payment proof submitted successfully.',
      payment_proof: proofUrl,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/my-orders - User's past orders
router.get('/my-orders', verifyToken, async (req, res, next) => {
  try {
    const { search, status } = req.query;

    let queryText = `
      SELECT id, serial_number, transport_name, total_amount, status, payment_status, created_at
      FROM orders
      WHERE user_id = $1
    `;
    const queryParams = [req.user.id];

    if (status && status !== 'All') {
      queryParams.push(status);
      queryText += ` AND status = $${queryParams.length}`;
    }

    if (search && search.trim()) {
      queryParams.push(`%${search.trim()}%`);
      queryText += ` AND (serial_number ILIKE $${queryParams.length} OR transport_name ILIKE $${queryParams.length} OR id::text ILIKE $${queryParams.length})`;
    }

    queryText += ` ORDER BY created_at DESC`;

    const result = await db.query(queryText, queryParams);

    return res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/orders/:id - Single order details with strict ownership verification
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch order
    const orderResult = await db.query(
      `SELECT o.id, o.serial_number, o.user_id, o.transport_name, o.total_amount,
              o.status, o.payment_status, o.payment_proof, o.created_at, o.updated_at,
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

    // STRICT USER SECURITY AUTHORIZATION CHECK (Section 32 requirement)
    if (order.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission to view this order.',
      });
    }

    // Fetch items
    const itemsResult = await db.query(
      `SELECT id, product_id, product_name, category_name, quantity, unit_price, total_price
       FROM order_items
       WHERE order_id = $1
       ORDER BY id ASC`,
      [id]
    );

    // Fetch department breakdown statuses
    const deptsResult = await db.query(
      `SELECT department_name, status, updated_at
       FROM order_department_statuses
       WHERE order_id = $1
       ORDER BY id ASC`,
      [id]
    );

    return res.json({
      success: true,
      order: {
        id: order.id,
        serial_number: order.serial_number || `SR${1000 + order.id}`,
        transport_name: order.transport_name,
        total_amount: parseFloat(order.total_amount),
        status: order.status,
        payment_status: order.payment_status,
        payment_proof: order.payment_proof,
        created_at: order.created_at,
        customer: {
          name: order.customer_name,
          email: order.customer_email,
          whatsapp: order.customer_whatsapp,
          state: order.customer_state,
        },
        items: itemsResult.rows.map((it) => ({
          ...it,
          unit_price: parseFloat(it.unit_price),
          total_price: parseFloat(it.total_price),
        })),
        department_statuses: deptsResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
