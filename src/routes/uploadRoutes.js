// backend/src/routes/uploadRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path'; // Node.js built-in module for path manipulation
import { fileURLToPath } from 'url'; // For ES Modules to get __dirname
import fs from 'fs'; // Import the file system module

const router = express.Router();

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define storage for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Define the destination folder for uploads
    const uploadPath = path.join(__dirname, '../../uploads/menu_items');
    
    // Ensure the directory exists. Create it recursively if it doesn't.
    // FIX: Uncommented fs.mkdirSync to ensure directory exists
    fs.mkdirSync(uploadPath, { recursive: true }); 
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename: fieldname-timestamp.ext
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

// Filter for image files
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Initialize multer upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB file size limit
});

/**
 * @route POST /api/upload/menu-item-image
 * @description Uploads a single image file for a menu item.
 * @access Private (Admin Only - assuming authMiddleware protects /api/upload)
 */
router.post('/menu-item-image', upload.single('menuImage'), (req, res) => {
  if (req.file) {
    // Construct the URL to access the image.
    // This assumes your Express app will serve static files from '/uploads'
    // For example, if saved to backend/uploads/menu_items/image.jpg,
    // the URL will be http://localhost:5000/uploads/menu_items/image.jpg
    const imageUrl = `/uploads/menu_items/${req.file.filename}`;
    res.status(200).json({ message: 'Image uploaded successfully', imageUrl: imageUrl });
  } else {
    res.status(400).json({ error: 'No image file provided or invalid file type.' });
  }
});

export default router;
