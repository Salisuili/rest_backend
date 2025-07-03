import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { createOrder, initiatePayment } from '../controllers/orderController.js';

const router = express.Router();

router.post('/', authMiddleware, createOrder);
router.post('/:orderId/pay', authMiddleware, initiatePayment);

export default router;