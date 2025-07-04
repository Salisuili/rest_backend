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

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, getMenuItems); // This handles GET /api/menu-items

router.post('/', authMiddleware, adminMiddleware, createMenuItem); 

router.get('/:id', authMiddleware, adminMiddleware, getMenuItemById); 
router.put('/:id', authMiddleware, adminMiddleware, updateMenuItem); 
router.patch('/:id/availability', authMiddleware, adminMiddleware, toggleMenuItemAvailability); 
router.delete('/:id', authMiddleware, adminMiddleware, deleteMenuItem); 

export default router;