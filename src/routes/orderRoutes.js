// backend/routes/orderRoutes.js
import express from 'express';
import {
  createOrder,
  initiatePayment,
  getOrders, // This function should be capable of getting all orders for admin, or specific orders for users
  getOrderById, // Assuming you have this
  updateOrderStatus // Assuming you have this for admin actions
} from '../controllers/orderController.js';
import { authMiddleware, adminMiddleware } from '../middlewares/authMiddleware.js'; // Import both middlewares

const router = express.Router();

// User-facing routes (authenticated, but not necessarily admin)
router.post('/', authMiddleware, createOrder);
router.post('/:orderId/pay', authMiddleware, initiatePayment);
router.get('/:id', authMiddleware, getOrderById); // User can view their own specific order

// Admin-only route to get all orders (for the admin dashboard)
router.get('/', authMiddleware, adminMiddleware, getOrders); // Protected

// Admin-only route to update order status
router.patch('/:id/status', authMiddleware, adminMiddleware, updateOrderStatus); // Protected

export default router;