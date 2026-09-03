const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/products - list all live products
router.get('/', async (req, res, next) => {
  try {
    const { category, search } = req.query;

    let queryText = `
      SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description,
             p.main_image, p.view_details_image, p.minimum_order_quantity, p.price,
             p.live_from_date, p.created_at
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = true
        AND c.is_active = true
        AND p.live_from_date <= NOW()
    `;

    const queryParams = [];

    if (category) {
      queryParams.push(category);
      queryText += ` AND (p.category_id::text = $${queryParams.length} OR c.slug = $${queryParams.length})`;
    }

    if (search) {
      queryParams.push(`%${search.trim()}%`);
      queryText += ` AND (p.name ILIKE $${queryParams.length} OR p.description ILIKE $${queryParams.length})`;
    }

    queryText += ` ORDER BY p.id ASC`;

    const result = await db.query(queryText, queryParams);

    return res.json({
      success: true,
      count: result.rows.length,
      products: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/category/:categoryId
router.get('/category/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    const result = await db.query(
      `SELECT p.id, p.category_id, c.name AS category_name, c.slug AS category_slug,
              p.name, p.description, p.main_image, p.view_details_image,
              p.minimum_order_quantity, p.price, p.live_from_date
       FROM products p
       JOIN categories c ON p.category_id = c.id
       WHERE (p.category_id::text = $1 OR c.slug = $1)
         AND p.is_active = true
         AND c.is_active = true
         AND p.live_from_date <= NOW()
       ORDER BY p.id ASC`,
      [categoryId]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      products: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id - single product detail
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT p.id, p.category_id, c.name AS category_name, c.slug AS category_slug,
              p.name, p.description, p.main_image, p.view_details_image,
              p.minimum_order_quantity, p.price, p.live_from_date
       FROM products p
       JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1
         AND p.is_active = true
         AND c.is_active = true
         AND p.live_from_date <= NOW()`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available currently.',
      });
    }

    return res.json({
      success: true,
      product: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
