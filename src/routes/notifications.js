const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// GET /api/notifications
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, user_id, title, message, is_read, link, created_at
       FROM notifications
       WHERE user_id = $1 OR user_id IS NULL
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const unreadCount = result.rows.filter((n) => !n.is_read).length;

    return res.json({
      success: true,
      unreadCount,
      notifications: result.rows,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;

    await db.query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [id, req.user.id]
    );

    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', verifyToken, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE notifications
       SET is_read = true
       WHERE (user_id = $1 OR user_id IS NULL) AND is_read = false`,
      [req.user.id]
    );

    return res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
