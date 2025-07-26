// backend/src/routes/orderRoutes.js
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Changed 'protect' to 'authMiddleware'
import {
    createOrder,
    getOrderById,
    getMyOrders,      // For authenticated user's orders
    getAllOrders,     // For admin to get all orders
    updateOrderStatus,
    initiatePayment,
    verifyPayment
} from '../controllers/orderController.js';

const router = express.Router();

// --- Public/Authenticated User Routes for Orders ---
router.post('/', authMiddleware, createOrder); // Create a new order
router.get('/my-orders', authMiddleware, getMyOrders); // Get orders for the authenticated user
router.get('/:id', authMiddleware, getOrderById); // Get a single order by ID (accessible by owner or admin)

// --- Payment Related Routes ---
router.post('/:id/initiate-payment', authMiddleware, initiatePayment); // Initiate payment for an order
// Note: verify-payment is typically called by a webhook or a redirect after payment,
// so its middleware might differ based on your payment gateway's setup.
router.get('/:id/verify-payment', authMiddleware, verifyPayment); // Verify payment status (e.g., after redirect)
// If you have a dedicated webhook endpoint that doesn't use `authMiddleware` or `adminMiddleware`
// router.post('/webhook/paystack', handlePaymentWebhook); // Example webhook route (if handlePaymentWebhook is exported)


// --- Admin Routes for Orders ---
// These routes require authentication. Authorization is handled within the controller functions.
router.get('/', authMiddleware, getAllOrders); // Admin gets all orders (authorization checked in controller)
router.put('/:id/status', authMiddleware, updateOrderStatus); // Admin updates order status (authorization checked in controller)

export default router;
