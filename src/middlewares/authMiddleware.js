// backend/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js'; // Ensure this path is correct

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new Error('Authentication required: No token provided'); // More specific error
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user exists and retrieve their role
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, role') // <--- IMPORTANT: Select the 'role' column
      .eq('id', decoded.id) // Assuming 'decoded.id' is the user's ID from the JWT payload
      .single();

    if (error || !user) {
      // If user not found, or any Supabase error during user fetch
      console.error("Auth middleware Supabase user fetch error:", error?.message || "User not found after token verification.");
      throw new Error('Authentication failed: User not found or invalid token');
    }

    req.user = user; // Attach the user object, which now includes the 'role'
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    let statusCode = 401; // Unauthorized by default
    let errorMessage = 'Not authorized: Invalid or expired token.';

    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Not authorized: Token has expired.';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Not authorized: Token is invalid.';
    } else if (error.message.includes('Authentication required')) {
      errorMessage = error.message; // Use the specific message for missing token
    } else {
      // Generic error, potentially from the DB lookup or other issues
      errorMessage = error.message || 'Authentication failed.';
    }

    res.status(statusCode).json({ error: errorMessage });
  }
};

// Update adminMiddleware to check the 'role' column directly
export const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') { // <--- IMPORTANT: Check req.user.role directly
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};