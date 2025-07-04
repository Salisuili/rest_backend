// backend/src/routes/userRoutes.js
import express from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/authMiddleware.js';
import {
    getUserProfile,
    updateUserProfile,
    getAllUsers,
    getSingleUserById, // NEW: For admin to get any user by ID
    deleteUser,
    updateUserRole,     // NEW: For admin to update user roles
    getUserAddresses,
    addUserAddress,
    updateAddress,      // NEW: For updating user addresses
    deleteAddress       // NEW: For deleting user addresses
} from '../controllers/userController.js';

const router = express.Router();

// --- Authenticated User Profile Routes ---
// These routes are for the currently logged-in user to manage their own profile and addresses.
// They require authMiddleware.

// Get logged-in user's profile
router.get('/profile', authMiddleware, getUserProfile);

// Update logged-in user's profile
router.put('/profile', authMiddleware, updateUserProfile);

// Get all addresses for the authenticated user
router.get('/me/addresses', authMiddleware, getUserAddresses);

// Add a new address for the authenticated user
router.post('/me/addresses', authMiddleware, addUserAddress);

// Update a specific address for the authenticated user
// The :id here refers to the address ID
router.put('/me/addresses/:id', authMiddleware, updateAddress);

// Delete a specific address for the authenticated user
// The :id here refers to the address ID
router.delete('/me/addresses/:id', authMiddleware, deleteAddress);


// --- Admin User Management Routes ---
// These routes are specifically for administrators to manage all users.
// They require both authMiddleware and adminMiddleware.

// Get all users (admin only)
router.get('/', authMiddleware, adminMiddleware, getAllUsers);

// Get a single user by ID (admin only)
// This is different from /profile, as admin can fetch *any* user's profile
router.get('/:id', authMiddleware, adminMiddleware, getSingleUserById);

// Delete a user by ID (admin only)
// The :id here refers to the user ID to be deleted
router.delete('/:id', authMiddleware, adminMiddleware, deleteUser);

// Update a user's role by ID (admin only)
// The :id here refers to the user ID whose role is being updated
router.put('/:id/role', authMiddleware, adminMiddleware, updateUserRole);

export default router;