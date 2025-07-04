// backend/routes/categoryRoutes.js
import express from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/categoryController.js';
import { authMiddleware, adminMiddleware } from '../middlewares/authMiddleware.js'; // Import both middlewares

const router = express.Router();

// Public route to get categories (anyone can view menu categories)
router.get('/', getCategories);

// Admin-only routes for managing categories
router.post('/', authMiddleware, adminMiddleware, createCategory); // Protected
router.put('/:id', authMiddleware, adminMiddleware, updateCategory); // Protected
router.delete('/:id', authMiddleware, adminMiddleware, deleteCategory); // Protected

export default router;