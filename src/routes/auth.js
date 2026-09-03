const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// Helper function to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      role_id: user.role_id,
      email: user.email,
      full_name: user.full_name,
    },
    process.env.JWT_SECRET || 'skylet_super_secret_jwt_key_2026_electrical_pro',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { full_name, birth_date, email, password, state, whatsapp_number } = req.body;

    // Validation checks
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ success: false, message: 'Full Name cannot be empty.' });
    }

    if (!birth_date || isNaN(Date.parse(birth_date))) {
      return res.status(400).json({ success: false, message: 'Please enter a valid birth date.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must contain at least 8 characters.' });
    }

    if (!state || !state.trim()) {
      return res.status(400).json({ success: false, message: 'State is required.' });
    }

    if (!whatsapp_number || !whatsapp_number.trim() || whatsapp_number.trim().length < 8) {
      return res.status(400).json({ success: false, message: 'Please enter a valid WhatsApp number.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email exists
    const existingUser = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user (role_id 1 = customer)
    const newUserResult = await db.query(
      `INSERT INTO users (role_id, full_name, email, password_hash, birth_date, state, whatsapp_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, role_id, full_name, email, birth_date, state, whatsapp_number, created_at`,
      [1, full_name.trim(), normalizedEmail, passwordHash, birth_date, state.trim(), whatsapp_number.trim()]
    );

    const user = newUserResult.rows[0];

    // Create persistent cart for user
    await db.query('INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);

    // Send welcome notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, link)
       VALUES ($1, $2, $3, $4)`,
      [
        user.id,
        'Welcome to VoltCraft Electrical Systems!',
        'Your account has been registered successfully. Explore categories, select product quantities, and place bulk orders.',
        '/categories',
      ]
    );

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: {
        id: user.id,
        role_id: user.role_id,
        full_name: user.full_name,
        email: user.email,
        birth_date: user.birth_date,
        state: user.state,
        whatsapp_number: user.whatsapp_number,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query user
    const result = await db.query(
      `SELECT id, role_id, full_name, email, password_hash, birth_date, state, whatsapp_number
       FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Ensure cart exists
    await db.query('INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);

    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        role_id: user.role_id,
        full_name: user.full_name,
        email: user.email,
        birth_date: user.birth_date,
        state: user.state,
        whatsapp_number: user.whatsapp_number,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  return res.json({ success: true, message: 'Logout successful.' });
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, role_id, full_name, email, birth_date, state, whatsapp_number, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    return res.json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
