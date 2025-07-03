// backend/src/routes/authRoutes.js
import express from 'express';
const router = express.Router();

import { register, login } from '../controllers/authController.js';

router.post('/register', register);
router.post('/login', login);

// Export the router instance as the default export
export default router;