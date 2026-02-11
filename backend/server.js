// NearHub Backend Server - COMPLETE & WORKING
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Import database
const db = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const searchRoutes = require('./routes/search');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const providerRoutes = require('./routes/providers');
const userRoutes = require('./routes/users');

// Initialize Express
const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(helmet()); // Security headers
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' })); // CORS
app.use(compression()); // Compress responses
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded

// Static files (QR code, images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// API ROUTES
// ============================================
const baseRoute = `${process.env.API_PREFIX || '/api'}/${process.env.API_VERSION || 'v1'}`;

app.use(`${baseRoute}/auth`, authRoutes);
app.use(`${baseRoute}/search`, searchRoutes);
app.use(`${baseRoute}/payments`, paymentRoutes);
app.use(`${baseRoute}/admin`, adminRoutes);
app.use(`${baseRoute}/providers`, providerRoutes);
app.use(`${baseRoute}/users`, userRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'NearHub API is running perfectly! ✅',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
  res.status(200).json({
    app: 'NearHub API',
    version: '1.0.0',
    description: 'Hyperlocal Service Marketplace - Backend API',
    status: 'operational',
    endpoints: {
      health: '/health',
      api: baseRoute,
      docs: `${baseRoute}/docs`
    },
    message: 'Welcome to NearHub! 🚀'
  });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    status: 'error',
    message: message,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      error: err 
    })
  });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 NEARHUB BACKEND SERVER');
  console.log('='.repeat(50));
  console.log(`✅ Status: Running`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base: ${baseRoute}`);
  console.log(`💾 Database: ${process.env.DB_NAME || 'nearhub_db'}`);
  console.log('\n📊 Available Endpoints:');
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API: http://localhost:${PORT}${baseRoute}`);
  console.log('='.repeat(50) + '\n');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM signal received: closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    db.end();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT signal received: closing server...');
  server.close(() => {
    console.log('✅ Server closed');
    db.end();
    process.exit(0);
  });
});

module.exports = app;
    
