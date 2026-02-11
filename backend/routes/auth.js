// Authentication Routes - COMPLETE & WORKING
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate JWT Token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// OTP Storage (In production use Redis)
const otpStore = new Map();

// ============================================
// SEND OTP
// ============================================
router.post('/send-otp', [
  body('phone').isMobilePhone('en-IN').withMessage('Valid 10-digit phone number required'),
  body('user_type').isIn(['user', 'provider']).withMessage('user_type must be "user" or "provider"')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { phone, user_type } = req.body;

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP (5 minute expiry)
    otpStore.set(phone, {
      otp,
      user_type,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0
    });

    console.log(`📱 OTP for ${phone}: ${otp}`);

    // In development, return OTP
    const response = {
      status: 'success',
      message: 'OTP sent successfully to ' + phone,
      phone
    };

    if (process.env.NODE_ENV === 'development') {
      response.otp = otp; // ONLY FOR TESTING!
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to send OTP' });
  }
});

// ============================================
// VERIFY OTP & LOGIN/REGISTER
// ============================================
router.post('/verify-otp', [
  body('phone').isMobilePhone('en-IN'),
  body('otp').isLength({ min: 6, max: 6 }),
  body('user_type').isIn(['user', 'provider'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { phone, otp, user_type, name } = req.body;

    // Check OTP
    const storedData = otpStore.get(phone);
    if (!storedData) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'OTP not found. Request new OTP.' 
      });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(phone);
      return res.status(400).json({ 
        status: 'error', 
        message: 'OTP expired. Request new OTP.' 
      });
    }

    if (storedData.attempts >= 3) {
      otpStore.delete(phone);
      return res.status(400).json({ 
        status: 'error', 
        message: 'Too many failed attempts.' 
      });
    }

    if (storedData.otp !== otp) {
      storedData.attempts++;
      return res.status(400).json({ 
        status: 'error', 
        message: 'Invalid OTP',
        attemptsLeft: 3 - storedData.attempts
      });
    }

    // OTP verified
    otpStore.delete(phone);

    // Check if exists
    const table = user_type === 'user' ? 'users' : 'service_providers';
    const idField = user_type === 'user' ? 'user_id' : 'provider_id';

    const [existing] = await db.query(
      `SELECT ${idField} as id, name, phone, email, is_active FROM ${table} WHERE phone = ?`,
      [phone]
    );

    let userId, isNewUser = false;

    if (existing.length > 0) {
      userId = existing[0].id;
      
      if (!existing[0].is_active && user_type === 'provider') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Account inactive. Complete payment to activate.',
          needsPayment: true
        });
      }
    } else {
      // New user - register
      if (!name) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Name required for new registration' 
        });
      }

      if (user_type === 'provider') {
        return res.status(400).json({ 
          status: 'error', 
          message: 'New providers must register through complete registration form' 
        });
      }

      const [result] = await db.query(
        `INSERT INTO ${table} (name, phone) VALUES (?, ?)`,
        [name, phone]
      );

      userId = result.insertId;
      isNewUser = true;
    }

    // Generate token
    const token = generateToken(userId, user_type);

    res.status(200).json({
      status: 'success',
      message: isNewUser ? 'Registration successful!' : 'Login successful!',
      data: {
        userId,
        name: existing[0]?.name || name,
        phone,
        token,
        isNewUser,
        userType: user_type
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ status: 'error', message: 'Verification failed' });
  }
});

// ============================================
// GOOGLE SIGN-IN (USER)
// ============================================
router.post('/google-signin/user', [
  body('email').isEmail(),
  body('name').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { email, name, profilePic } = req.body;

    const [existing] = await db.query(
      'SELECT user_id, name, phone, email, is_active FROM users WHERE email = ?',
      [email]
    );

    let userId, isNewUser = false;

    if (existing.length > 0) {
      userId = existing[0].user_id;
      
      if (!existing[0].is_active) {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Account deactivated' 
        });
      }

      if (profilePic) {
        await db.query(
          'UPDATE users SET profile_pic = ? WHERE user_id = ?',
          [profilePic, userId]
        );
      }
    } else {
      const [result] = await db.query(
        'INSERT INTO users (name, email, profile_pic) VALUES (?, ?, ?)',
        [name, email, profilePic || null]
      );

      userId = result.insertId;
      isNewUser = true;
    }

    const token = generateToken(userId, 'user');

    res.status(200).json({
      status: 'success',
      message: isNewUser ? 'Welcome to NearHub!' : 'Welcome back!',
      data: {
        userId,
        name: existing[0]?.name || name,
        email,
        token,
        isNewUser
      }
    });

  } catch (error) {
    console.error('Google signin error:', error);
    res.status(500).json({ status: 'error', message: 'Google signin failed' });
  }
});

// ============================================
// USER REGISTRATION (Traditional)
// ============================================
router.post('/register/user', [
  body('name').trim().notEmpty(),
  body('phone').isMobilePhone('en-IN'),
  body('password').isLength({ min: 6 }),
  body('city').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { name, phone, email, password, city, state, latitude, longitude } = req.body;

    // Check if exists
    const [existing] = await db.query(
      'SELECT user_id FROM users WHERE phone = ?',
      [phone]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Phone number already registered' 
      });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert
    const [result] = await db.query(
      `INSERT INTO users (name, phone, email, password_hash, city, state, current_latitude, current_longitude) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email || null, password_hash, city, state || 'Bihar', latitude || null, longitude || null]
    );

    const token = generateToken(result.insertId, 'user');

    res.status(201).json({
      status: 'success',
      message: 'Registration successful!',
      data: {
        userId: result.insertId,
        name,
        phone,
        token
      }
    });

  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ status: 'error', message: 'Registration failed' });
  }
});

// ============================================
// PROVIDER REGISTRATION
// ============================================
router.post('/register/provider', [
  body('name').trim().notEmpty(),
  body('phone').isMobilePhone('en-IN'),
  body('password').isLength({ min: 6 }),
  body('category_id').isInt(),
  body('city').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { 
      name, phone, email, password, category_id, business_name,
      city, state, address, latitude, longitude, description
    } = req.body;

    const [existing] = await db.query(
      'SELECT provider_id FROM service_providers WHERE phone = ?',
      [phone]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Phone number already registered' 
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO service_providers 
       (name, phone, email, password_hash, category_id, business_name, city, state, address, latitude, longitude, description, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [name, phone, email || null, password_hash, category_id, business_name || name, 
       city, state || 'Bihar', address || null, latitude || null, longitude || null, description || null]
    );

    const token = generateToken(result.insertId, 'provider');

    res.status(201).json({
      status: 'success',
      message: 'Registration successful! Please complete payment to activate.',
      data: {
        providerId: result.insertId,
        name,
        phone,
        token,
        needsPayment: true
      }
    });

  } catch (error) {
    console.error('Provider registration error:', error);
    res.status(500).json({ status: 'error', message: 'Registration failed' });
  }
});

// ============================================
// USER LOGIN
// ============================================
router.post('/login/user', [
  body('phone').isMobilePhone('en-IN'),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { phone, password } = req.body;

    const [users] = await db.query(
      'SELECT user_id, name, phone, email, password_hash, is_active FROM users WHERE phone = ?',
      [phone]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Invalid phone or password' 
      });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'Account deactivated' 
      });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Invalid phone or password' 
      });
    }

    const token = generateToken(user.user_id, 'user');

    res.status(200).json({
      status: 'success',
      message: 'Login successful!',
      data: {
        userId: user.user_id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        token
      }
    });

  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({ status: 'error', message: 'Login failed' });
  }
});

// ============================================
// PROVIDER LOGIN
// ============================================
router.post('/login/provider', [
  body('phone').isMobilePhone('en-IN'),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ status: 'error', errors: errors.array() });
    }

    const { phone, password } = req.body;

    const [providers] = await db.query(
      `SELECT sp.*, sc.category_name, spl.plan_name 
       FROM service_providers sp
       LEFT JOIN service_categories sc ON sp.category_id = sc.category_id
       LEFT JOIN subscription_plans spl ON sp.plan_id = spl.plan_id
       WHERE sp.phone = ?`,
      [phone]
    );

    if (providers.length === 0) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Invalid phone or password' 
      });
    }

    const provider = providers[0];

    const isValid = await bcrypt.compare(password, provider.password_hash);
    if (!isValid) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Invalid phone or password' 
      });
    }

    const token = generateToken(provider.provider_id, 'provider');

    const needsPayment = !provider.is_active;

    res.status(200).json({
      status: 'success',
      message: needsPayment ? 'Login successful! Complete payment to activate.' : 'Login successful!',
      data: {
        providerId: provider.provider_id,
        name: provider.name,
        businessName: provider.business_name,
        phone: provider.phone,
        category: provider.category_name,
        plan: provider.plan_name,
        isActive: provider.is_active,
        needsPayment,
        token
      }
    });

  } catch (error) {
    console.error('Provider login error:', error);
    res.status(500).json({ status: 'error', message: 'Login failed' });
  }
});

module.exports = router;
