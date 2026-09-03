const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET /api/company - Get bank & payment info
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT company_name, tagline, support_phone, bank_name, account_name, account_number, ifsc_code, upi_id, qr_code_image
       FROM company_settings
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        company: {
          company_name: 'VoltCraft Electrical Systems',
          tagline: 'Reliable Electrical Products Built for Performance & Quality',
          support_phone: '9227677800',
          bank_name: 'HDFC Bank Ltd.',
          account_name: 'VoltCraft Industrial Solutions Pvt Ltd',
          account_number: '50200088912345',
          ifsc_code: 'HDFC0001234',
          upi_id: 'voltcraft@hdfcbank',
          qr_code_image: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=voltcraft@hdfcbank&pn=VoltCraft%20Electrical',
        },
      });
    }

    return res.json({
      success: true,
      company: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
