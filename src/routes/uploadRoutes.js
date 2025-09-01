import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define storage for Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // The path should be relative to the project root
    cb(null, path.join(__dirname, '../../uploads/menu_items'));
  },
  filename: (req, file, cb) => {
    // Generate a unique filename to prevent collisions
    const uniqueSuffix = uuidv4();
    const fileExtension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${fileExtension}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|jfif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error(`Error: File upload only supports the following filetypes - ${filetypes}`));
  },
});

// This is the new, more robust route
router.post('/menu-item', upload.single('menuImage'), async (req, res, next) => {
  try {
    // Check if the file was uploaded successfully by Multer
    if (!req.file) {
      console.error("No file uploaded. Check frontend request or Multer configuration.");
      // It's crucial to return a success response with a null URL
      // so the app doesn't crash, but you can log the issue.
      return res.status(200).json({
        success: true,
        message: "Menu item created without an image.",
        imageUrl: null
      });
    }

   
    const imageUrl = `/uploads/menu_items/${req.file.filename}`;
    
    

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully.',
      imageUrl: imageUrl,
    });
  } catch (err) {
    // If Multer or any other part of the process fails, it will catch the error here.
    console.error('File upload failed:', err);
    res.status(500).json({
      success: false,
      message: 'File upload failed.',
      error: err.message
    });
  }
});

export default router;
