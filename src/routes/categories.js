const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/categories
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT c.id, c.name, c.slug, c.description, c.image_url, c.is_active,
              COUNT(p.id) FILTER (WHERE p.is_active = true AND p.live_from_date <= NOW())::int AS active_product_count
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id
       WHERE c.is_active = true
       GROUP BY c.id
       ORDER BY c.id ASC`
    );

    return res.json({
      success: true,
      categories: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/categories/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT id, name, slug, description, image_url, is_active
       FROM categories
       WHERE (id::text = $1 OR slug = $1) AND is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    return res.json({
      success: true,
      category: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
