// JWT Authentication Middleware
const jwt = require('jsonwebtoken');

// Verify JWT Token
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided. Authorization header missing.'
      });
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Token format invalid. Use: Bearer <token>'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to request
    req.userId = decoded.userId;
    req.userType = decoded.userType;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired. Please login again.'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Authentication failed.'
      });
    }
    
    return res.status(500).json({
      status: 'error',
      message: 'Authentication error'
    });
  }
};

// Verify Admin Token
const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.userType !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Admin privileges required.'
      });
    }
    req.adminId = req.userId;
    next();
  });
};

// Verify User Token
const verifyUser = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.userType !== 'user') {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. User account required.'
      });
    }
    next();
  });
};

// Verify Provider Token
const verifyProvider = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.userType !== 'provider') {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Provider account required.'
      });
    }
    req.providerId = req.userId;
    next();
  });
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyUser,
  verifyProvider
};

