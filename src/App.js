// backend/src/app.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config'; // Keep your existing dotenv config style
import path from 'path'; // Import path module
import { fileURLToPath } from 'url'; // For ES Modules to get __dirname

// Import Routes
import authRoutes from './routes/authRoutes.js';
import menuRoutes from './routes/menuRoutes.js'; // Assuming this is for general menu display
import orderRoutes from './routes/orderRoutes.js';
import userRoutes from './routes/userRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import menuItemRoutes from './routes/menuItemRoutes.js'; 
import uploadRoutes from './routes/uploadRoutes.js'; 

// Import your custom error middleware
import errorMiddleware from './middlewares/errorMiddleware.js';

const app = express();

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL 
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes); // General menu routes
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/menu-items', menuItemRoutes); 
app.use('/api/upload', uploadRoutes); 

app.use(errorMiddleware);

app.get('/', (req, res) => {
    res.send('Restaurant Management System API is running!');
});

export default app; // Export the app instance
