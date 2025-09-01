// backend/src/controllers/authController.js
import supabase from '../config/supabase.js'; // Ensure .js extension for local module
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const register = async (req, res) => {
    try {
        const { email, password, full_name, phone_number } = req.body;

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        console.log('Attempting to insert user into Supabase...');
        const { data: user, error } = await supabase
            .from('users')
            .insert([
                {
                    email,
                    password_hash: passwordHash,
                    full_name,
                    phone_number,
                    // 'role' column will automatically default to 'user' as per your SQL setup
                    // You don't need to explicitly set it here unless you want to allow registration
                    // with a specific role, which is typically not done for public registration.
                }
            ])
            .select('id, email, full_name, role') 
            .single();

        if (error) {
            if (error.code === '23505' && error.details.includes('email')) {
                // Using 409 Conflict for duplicate resource
                return res.status(409).json({ error: 'Email already registered. Please use a different email.' });
            }
            // For any other Supabase error during insert
            throw new Error(`Supabase error during registration: ${error.message || 'Unknown error'}`);
        }

        if (!user) {
            throw new Error('User registration failed, no user data returned after insert.');
        }

        // --- Check JWT_SECRET availability ---
        if (!process.env.JWT_SECRET) {
            throw new Error('Server configuration error: JWT secret is missing.');
        }

        // Generate token including the user's role
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role }, 
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role // 
            }
        });

    } catch (error) {
        if (!res.headersSent) {
            res.status(400).json({ error: error.message || 'An unknown error occurred during registration.' });
        }
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, full_name, role, password_hash') 
            .eq('email', email)
            .single();

        // --- Check for user existence or database query error ---
        if (error) {
            console.error('Login Supabase error:', error.message); 
            throw new Error('Database query failed during login. Please try again later.');
        }
        if (!user) {
            throw new Error('Invalid credentials'); 
        }

        // Compare provided password with hashed password from DB
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            throw new Error('Invalid credentials'); 
        }

        if (!process.env.JWT_SECRET) {
            throw new Error('Server configuration error: JWT secret is missing.');
        }

        // Generate token including the user's role
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role }, 
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login general error:', error.message); 
        if (!res.headersSent) {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    }
};

export const getProfile = (req, res) => {
    if (req.user) {
        const { password_hash, ...userWithoutHash } = req.user; // Destructure to remove password_hash
        return res.status(200).json(userWithoutHash);
    } else {
        return res.status(401).json({ error: 'User not authenticated after middleware processing.' });
    }
};