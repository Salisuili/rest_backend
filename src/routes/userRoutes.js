// backend/src/routes/userRoutes.js
import express from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/authMiddleware.js';
import {
    getUserProfile,
    updateUserProfile,
    getAllUsers,
    deleteUser,
    getUserAddresses, // <--- NEW: Import
    addUserAddress    // <--- NEW: Import
} from '../controllers/userController.js';

const router = express.Router();

// Get logged-in user's profile
router.get('/profile', authMiddleware, getUserProfile);

// Update logged-in user's profile
router.put('/profile', authMiddleware, updateUserProfile);

// Admin routes for managing all users
router.get('/', authMiddleware, adminMiddleware, getAllUsers);
router.delete('/:id', authMiddleware, adminMiddleware, deleteUser); // Assuming :id is the user_id

router.get('/me/addresses', authMiddleware, getUserAddresses);

// Add a new address for the authenticated user
router.post('/me/addresses', authMiddleware, addUserAddress);

export default router;