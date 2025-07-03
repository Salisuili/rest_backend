import express from 'express';
import { getCategories, getMenuItems } from '../controllers/menuController.js';

const router = express.Router();

router.get('/categories', getCategories);
router.get('/items', getMenuItems);

export default router;