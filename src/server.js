const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const categoriesRoutes = require('./routes/categories');
const productsRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const notificationsRoutes = require('./routes/notifications');
const catalogRoutes = require('./routes/catalog');
const profileRoutes = require('./routes/profile');
const companyRoutes = require('./routes/company');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/company', companyRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'VoltCraft Electrical API is running cleanly.' });
});

// 404 Handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Resource API route not found.' });
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`VoltCraft Electrical Backend Server listening on port ${PORT}`);
});

module.exports = app;
