const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware factory: returns middleware that checks for roles
const auth = (roles = []) => {
  return async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      console.log('Auth middleware - Token received:', token ? 'Yes' : 'No');
      
      if (!token) {
        console.log('Auth middleware - No token provided');
        return res.status(401).json({ message: 'Access denied. No token provided.' });
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Auth middleware - Token decoded, userId:', decoded.userId);
      
      const user = await User.findById(decoded.userId);
      console.log('Auth middleware - User found:', user ? user.email : 'No user found');
      
      if (!user) {
        console.log('Auth middleware - Invalid token, user not found');
        return res.status(401).json({ message: 'Invalid token.' });
      }
      
      // if (user.status !== 'active') {
      //   return res.status(401).json({ message: 'Account is deactivated.' });
      // }
      
      if (roles.length > 0 && !roles.includes(user.role)) {
        console.log('Auth middleware - Insufficient role:', user.role);
        return res.status(403).json({ message: 'Access denied. Insufficient role.' });
      }
      
      req.user = user;
      console.log('Auth middleware - User authenticated:', user.email);
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(401).json({ message: 'Invalid token.' });
    }
  };
};

const adminAuth = auth(['admin']);

module.exports = { auth, adminAuth }; 