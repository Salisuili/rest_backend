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
        //     return res.status(403).json({ error: 'Cannot delete your own admin account' });
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

// --- NEW: User Address Management Functions ---

export const getUserAddresses = async (req, res) => {
    try {
        const userId = req.user.id; // Get user ID from authenticated request

        const { data: addresses, error } = await supabase
            .from('user_addresses')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false }) // Default addresses first
            .order('created_at', { ascending: false }); // Then by newest

        if (error) {
            console.error('Supabase error fetching user addresses:', error.message);
            throw new Error('Database error fetching user addresses.');
        }

        res.status(200).json(addresses);
    } catch (error) {
        console.error('Error in getUserAddresses:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error fetching addresses.' });
    }
};

export const addUserAddress = async (req, res) => {
    try {
        const userId = req.user.id; // Get user ID from authenticated request
        const { street_address, city, state, postal_code, country, is_default } = req.body;

        if (!street_address || !city || !country) {
            return res.status(400).json({ error: 'Street address, city, and country are required.' });
        }

        // If the new address is set as default, ensure all other addresses for this user are not default
        if (is_default) {
            await supabase
                .from('user_addresses')
                .update({ is_default: false })
                .eq('user_id', userId);
        }

        const { data: newAddress, error } = await supabase
            .from('user_addresses')
            .insert([{
                user_id: userId,
                street_address,
                city,
                state,
                postal_code,
                country,
                is_default: is_default || false // Default to false if not provided
            }])
            .select('*')
            .single();

        if (error) {
            console.error('Supabase error adding user address:', error.message);
            throw new Error('Database error adding user address.');
        }

        res.status(201).json(newAddress);

    } catch (error) {
        console.error('Error in addUserAddress:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error adding address.' });
    }
};