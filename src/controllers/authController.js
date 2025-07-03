// backend/src/controllers/authController.js
import supabase from '../config/supabase.js'; // Ensure .js extension for local module
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export const register = async (req, res) => {
    try {
        const { email, password, full_name, phone_number } = req.body;

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const { data: user, error } = await supabase
            .from('users')
            .insert([
                {
                    email,
                    password_hash: passwordHash,
                    full_name,
                    phone_number
                }
            ])
            .single();

        if (error) throw error;

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({ token, user: { id: user.id, email: user.email, full_name: user.full_name } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !user) throw new Error('Invalid credentials');

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) throw new Error('Invalid credentials');

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name } });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};