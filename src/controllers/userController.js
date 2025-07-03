// backend/src/controllers/userController.js
import supabase from '../config/supabase.js';

export const getUserProfile = async (req, res) => {
    try {
        // req.user is populated by authMiddleware
        const { id } = req.user; 

        const { data: user, error } = await supabase
            .from('users')
            .select('id, full_name, email, phone_number, created_at') // Select specific fields for security
            .eq('id', id)
            .single();

        if (error || !user) {
            throw new Error('User profile not found');
        }

        res.json(user);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
};

export const updateUserProfile = async (req, res) => {
    try {
        const { id } = req.user; // User ID from authenticated session
        const { full_name, phone_number } = req.body; // Allow updating these fields

        const updates = {};
        if (full_name) updates.full_name = full_name;
        if (phone_number) updates.phone_number = phone_number;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select('id, full_name, email, phone_number, created_at') // Return updated fields
            .single();

        if (error) throw error;

        res.json(updatedUser);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, full_name, email, phone_number, is_admin, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params; // User ID to delete from URL parameter

        // Optional: Prevent admin from deleting themselves, or last admin
        // if (req.user.id === id) {
        //     return res.status(403).json({ error: 'Cannot delete your own admin account' });
        // }

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.status(204).send(); // No content response for successful deletion
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};