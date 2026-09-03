const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// GET /api/profile
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, role_id, full_name, email, birth_date, state, whatsapp_number, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile not found.' });
    }

    return res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/profile
router.patch('/', verifyToken, async (req, res, next) => {
  try {
    const { full_name, birth_date, state, whatsapp_number } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ success: false, message: 'Full Name cannot be empty.' });
    }

    if (!birth_date || isNaN(Date.parse(birth_date))) {
      return res.status(400).json({ success: false, message: 'Valid birth date required.' });
    }

    if (!state || !state.trim()) {
      return res.status(400).json({ success: false, message: 'State is required.' });
    }

    if (!whatsapp_number || !whatsapp_number.trim() || whatsapp_number.trim().length < 8) {
      return res.status(400).json({ success: false, message: 'Valid WhatsApp number required.' });
    }

    const result = await db.query(
      `UPDATE users
       SET full_name = $1, birth_date = $2, state = $3, whatsapp_number = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, role_id, full_name, email, birth_date, state, whatsapp_number, updated_at`,
      [full_name.trim(), birth_date, state.trim(), whatsapp_number.trim(), req.user.id]
    );

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
