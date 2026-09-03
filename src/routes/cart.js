const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// Helper to get or create cart for user
const getUserCartId = async (userId) => {
  let cartResult = await db.query('SELECT id FROM carts WHERE user_id = $1', [userId]);
  if (cartResult.rows.length === 0) {
    cartResult = await db.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING id', [userId]);
  }
  return cartResult.rows[0].id;
};

// GET /api/cart - Fetch current user cart items
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const cartId = await getUserCartId(req.user.id);

    const itemsResult = await db.query(
      `SELECT ci.id AS cart_item_id, ci.quantity,
              p.id AS product_id, p.name AS product_name, p.description, p.main_image,
              p.minimum_order_quantity, p.price,
              c.name AS category_name, c.id AS category_id
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       WHERE ci.cart_id = $1 AND p.is_active = true AND p.live_from_date <= NOW()
       ORDER BY ci.created_at DESC`,
      [cartId]
    );

    let totalItems = 0;
    let subtotal = 0;

    const items = itemsResult.rows.map((item) => {
      const quantity = parseInt(item.quantity, 10);
      const price = parseFloat(item.price);
      const itemTotal = quantity * price;

      totalItems += quantity;
      subtotal += itemTotal;

      return {
        cart_item_id: item.cart_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        category_name: item.category_name,
        category_id: item.category_id,
        main_image: item.main_image,
        minimum_order_quantity: parseInt(item.minimum_order_quantity, 10),
        quantity,
        price,
        item_total: itemTotal,
      };
    });

    return res.json({
      success: true,
      cart_id: cartId,
      total_items: totalItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      final_total: parseFloat(subtotal.toFixed(2)),
      items,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/cart/items - Add item to cart with backend MOQ validation
router.post('/items', verifyToken, async (req, res, next) => {
  try {
    const { product_id, quantity } = req.body;

    if (!product_id || !quantity || parseInt(quantity, 10) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid product ID and positive quantity are required.' });
    }

    const requestedQty = parseInt(quantity, 10);

    // Fetch product to verify live date, active state, and MOQ
    const productResult = await db.query(
      `SELECT id, name, minimum_order_quantity, price, is_active, live_from_date
       FROM products
       WHERE id = $1`,
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const product = productResult.rows[0];

    if (!product.is_active || new Date(product.live_from_date) > new Date()) {
      return res.status(400).json({ success: false, message: 'Product is currently not available for purchase.' });
    }

    const moq = parseInt(product.minimum_order_quantity, 10);

    // Check existing item in cart
    const cartId = await getUserCartId(req.user.id);
    const existingItem = await db.query(
      `SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
      [cartId, product_id]
    );

    let finalQty = requestedQty;
    if (existingItem.rows.length > 0) {
      finalQty = parseInt(existingItem.rows[0].quantity, 10) + requestedQty;
    }

    // MANDATORY BACKEND MOQ VALIDATION
    if (finalQty < moq) {
      return res.status(400).json({
        success: false,
        message: `Minimum order quantity is ${moq}.`,
        minimum_order_quantity: moq,
      });
    }

    if (existingItem.rows.length > 0) {
      await db.query(
        `UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [finalQty, existingItem.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)`,
        [cartId, product_id, finalQty]
      );
    }

    return res.json({
      success: true,
      message: `Added ${product.name} to cart successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/cart/items/:id - Update cart item quantity
router.patch('/items/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || parseInt(quantity, 10) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive quantity required.' });
    }

    const requestedQty = parseInt(quantity, 10);
    const cartId = await getUserCartId(req.user.id);

    // Fetch cart item with product MOQ
    const itemResult = await db.query(
      `SELECT ci.id, ci.cart_id, p.minimum_order_quantity, p.name AS product_name
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.id = $1 AND ci.cart_id = $2`,
      [id, cartId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cart item not found.' });
    }

    const moq = parseInt(itemResult.rows[0].minimum_order_quantity, 10);

    // MANDATORY BACKEND MOQ VALIDATION
    if (requestedQty < moq) {
      return res.status(400).json({
        success: false,
        message: `Minimum order quantity is ${moq}.`,
        minimum_order_quantity: moq,
      });
    }

    await db.query(
      `UPDATE cart_items SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [requestedQty, id]
    );

    return res.json({
      success: true,
      message: 'Cart quantity updated.',
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/cart/items/:id - Remove item
router.delete('/items/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const cartId = await getUserCartId(req.user.id);

    await db.query(`DELETE FROM cart_items WHERE id = $1 AND cart_id = $2`, [id, cartId]);

    return res.json({ success: true, message: 'Item removed from cart.' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/cart - Clear cart
router.delete('/', verifyToken, async (req, res, next) => {
  try {
    const cartId = await getUserCartId(req.user.id);
    await db.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);

    return res.json({ success: true, message: 'Cart cleared successfully.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
