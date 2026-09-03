const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/catalog - Get active PDF catalog
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, title, pdf_url, version, created_at
       FROM catalogs
       WHERE is_active = true
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        catalog: {
          title: 'VoltCraft Industrial Electrical Catalog 2026',
          pdf_url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          version: 'v2026.1',
        },
      });
    }

    return res.json({
      success: true,
      catalog: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
