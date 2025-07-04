// backend/routes/dashboardRoutes.js
import express from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { authMiddleware, adminMiddleware } from '../middlewares/authMiddleware.js'; // Import both middlewares

const router = express.Router();

// Admin-only route to get dashboard statistics
router.get('/', authMiddleware, adminMiddleware, getDashboardStats); // Protected

export default router;