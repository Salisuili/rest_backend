// backend/src/routes/menuItemRoutes.js
import express from 'express';
import {
    getMenuItems,
    getMenuItemById,
    createMenuItem,
    updateMenuItem,
    toggleMenuItemAvailability,
    deleteMenuItem
} from '../controllers/menuItemController.js';
import { authMiddleware, adminMiddleware } from '../middlewares/authMiddleware.js';
import upload from '../config/multerConfig.js'; // Import the multer upload middleware

const router = express.Router();

// Public routes (e.g., for users to browse menu)
// Assuming getMenuItems and getMenuItemById are public or have their own auth logic if needed
router.get('/', getMenuItems); // This handles GET /api/menu-items
router.get('/:id', getMenuItemById);

// Admin-only routes for CRUD operations, now including multer for image upload
router.post(
    '/',
    authMiddleware,
    adminMiddleware,
    upload.single('image'), // <--- IMPORTANT: Apply multer middleware here for image upload
    createMenuItem
);

router.put(
    '/:id',
    authMiddleware,
    adminMiddleware,
    upload.single('image'), // <--- IMPORTANT: Apply multer middleware here for updates
    updateMenuItem
);

router.patch('/:id/availability', authMiddleware, adminMiddleware, toggleMenuItemAvailability);
router.delete('/:id', authMiddleware, adminMiddleware, deleteMenuItem);

export default router;
