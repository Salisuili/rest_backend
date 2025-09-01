// backend/src/routes/authRoutes.js
import express from 'express';
const router = express.Router();

import { register, login, getProfile } from '../controllers/authController.js'; 
import { authMiddleware } from '../middlewares/authMiddleware.js'; 

router.post('/register', register);
router.post('/login', login);

router.get('/me', authMiddleware, getProfile); 

export default router;