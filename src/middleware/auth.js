const jwt = require('jsonwebtoken');
const db = require('../config/db');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'skylet_super_secret_jwt_key_2026_electrical_pro');
    
    // Check if user is active in DB
    const userResult = await db.query(
      `SELECT u.id, u.role_id, r.name AS role_name, u.full_name, u.email, u.is_active, u.department_id
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User account no longer exists.' });
    }

    const user = userResult.rows[0];

    // REQUIREMENT Rule 8 & Rule 9: Deactivated users / department accounts cannot login / access APIs
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Access denied.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
  }
};

// Role-based authorization middleware
const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden. Access requires one of the following roles: ${allowedRoles.join(', ')}.`,
      });
    }
    next();
  };
};

const verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role_name !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  next();
};

module.exports = { verifyToken, authorizeRole, verifyAdmin };
