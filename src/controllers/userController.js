// backend/src/controllers/userController.js
import supabase from '../config/supabase.js';

// --- User Profile Management (for logged-in user) ---

export const getUserProfile = async (req, res) => {
    try {
        // req.user is populated by authMiddleware
        const { id } = req.user;

        const { data: user, error } = await supabase
            .from('users')
            // Select specific fields for security and privacy
            .select('id, full_name, email, phone_number, created_at, role') // Include role for front-end
            .eq('id', id)
            .single();

        if (error || !user) {
            // Use 404 for not found, 500 for other database errors
            if (error?.code === 'PGRST116') { // Supabase code for no rows found
                return res.status(404).json({ error: 'User profile not found.' });
            }
            console.error('Supabase error fetching user profile:', error?.message);
            return res.status(500).json({ error: 'Database error fetching user profile.' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error in getUserProfile:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error fetching profile.' });
    }
};

export const updateUserProfile = async (req, res) => {
    try {
        const { id } = req.user; // User ID from authenticated session
        const { full_name, phone_number } = req.body; // Fields allowed for update

        const updates = { updated_at: new Date().toISOString() }; // Always update timestamp
        if (full_name !== undefined) updates.full_name = full_name;
        if (phone_number !== undefined) updates.phone_number = phone_number;

        if (Object.keys(updates).length === 1 && updates.updated_at) { // Only updated_at was set
            return res.status(400).json({ error: 'No user fields to update. Provide full_name or phone_number.' });
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select('id, full_name, email, phone_number, created_at, role') // Return updated fields including role
            .single();

        if (error) {
            console.error('Supabase error updating user profile:', error.message);
            return res.status(500).json({ error: 'Database error updating user profile.' });
        }
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found or no changes made.' });
        }

        res.status(200).json(updatedUser);
    } catch (error) {
        console.error('Error in updateUserProfile:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error updating profile.' });
    }
};

// --- Admin User Management ---

export const getAllUsers = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can view all users.' });
        }

        const { data: users, error } = await supabase
            .from('users')
            .select('id, full_name, email, phone_number, role, created_at, updated_at')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error fetching all users (admin):', error.message);
            return res.status(500).json({ error: 'Database error fetching users.' });
        }
        res.status(200).json(users);
    } catch (error) {
        console.error('Error in getAllUsers (admin):', error.message);
        res.status(500).json({ error: error.message || 'Internal server error.' });
    }
};

export const getSingleUserById = async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can view other user profiles directly.' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id, full_name, email, phone_number, role, created_at, updated_at')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Supabase error fetching single user by ID (admin):', error.message);
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'User not found.' });
            }
            return res.status(500).json({ error: 'Database error fetching user.' });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error('Error in getSingleUserById:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error.' });
    }
};


export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params; // User ID to delete from URL parameter
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        if (currentUserRole !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can delete users.' });
        }

        if (currentUserId === id) {
            return res.status(400).json({ error: 'You cannot delete your own account through this interface.' });
        }

        const { data: targetUser, error: targetUserError } = await supabase
            .from('users')
            .select('role')
            .eq('id', id)
            .single();

        if (targetUserError || !targetUser) {
            return res.status(404).json({ error: 'User to delete not found.' });
        }
        if (targetUser.role === 'admin') {
             const { count: adminCount, error: countError } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'admin');

             if (countError) console.error("Error counting admins:", countError.message);

             if (adminCount <= 1) { // If this is the only admin
                 return res.status(400).json({ error: 'Cannot delete the last administrator account.' });
             }
        }


        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Supabase error deleting user:', error.message);
            if (error.code === '23503') { // Foreign key violation
                return res.status(400).json({ error: 'Cannot delete user: Associated data (e.g., orders, addresses) exists. Consider deactivating or anonymizing the user instead.' });
            }
            return res.status(500).json({ error: 'Database error deleting user.' });
        }

        res.status(200).json({ message: 'User deleted successfully.' }); // Use 200 with message instead of 204 for better feedback
    } catch (error) {
        console.error('Error in deleteUser (admin):', error.message);
        res.status(500).json({ error: error.message || 'Internal server error deleting user.' });
    }
};

export const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params; // User ID to update
        const { role } = req.body; // New role
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        if (currentUserRole !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can update user roles.' });
        }

        const validRoles = ['admin', 'user']; // Define your valid roles
        if (!role || !validRoles.includes(role)) {
            return res.status(400).json({ error: `Invalid role provided. Valid roles are: ${validRoles.join(', ')}.` });
        }

        if (id === currentUserId && role !== 'admin') {
            return res.status(400).json({ error: 'You cannot demote your own admin account.' });
        }

        if (targetUser && targetUser.role === 'admin' && role !== 'admin') {
             const { count: adminCount, error: countError } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'admin');

             if (countError) console.error("Error counting admins for role update:", countError.message);

             if (adminCount <= 1) {
                 return res.status(400).json({ error: 'Cannot demote the last administrator account.' });
             }
        }


        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({ role: role, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, full_name, email, phone_number, role, created_at, updated_at')
            .single();

        if (error) {
            console.error('Supabase error updating user role:', error.message);
            return res.status(500).json({ error: 'Database error updating user role.' });
        }
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found or no changes made.' });
        }

        res.status(200).json({ message: 'User role updated successfully.', user: updatedUser });
    } catch (error) {
        console.error('Error in updateUserRole (admin):', error.message);
        res.status(500).json({ error: error.message || 'Internal server error updating user role.' });
    }
};


export const getUserAddresses = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: addresses, error } = await supabase
            .from('user_addresses')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error fetching user addresses:', error.message);
            return res.status(500).json({ error: 'Database error fetching user addresses.' });
        }

        res.status(200).json(addresses);
    } catch (error) {
        console.error('Error in getUserAddresses:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error fetching addresses.' });
    }
};

export const addUserAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { street_address, city, state, postal_code, country, is_default } = req.body;

        if (!street_address || !city || !country) {
            return res.status(400).json({ error: 'Street address, city, and country are required.' });
        }

        if (is_default) {
            await supabase
                .from('user_addresses')
                .update({ is_default: false, updated_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('is_default', true); // Only unset the one that is currently default
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
                is_default: is_default || false,
                created_at: new Date().toISOString(), // Add created_at
                updated_at: new Date().toISOString()  // Add updated_at
            }])
            .select('*')
            .single();

        if (error) {
            console.error('Supabase error adding user address:', error.message);
            return res.status(500).json({ error: 'Database error adding user address.' });
        }

        res.status(201).json(newAddress);

    } catch (error) {
        console.error('Error in addUserAddress:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error adding address.' });
    }
};

export const updateAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: addressId } = req.params; // Address ID from URL
        const { street_address, city, state, postal_code, country, is_default } = req.body;

        const updates = { updated_at: new Date().toISOString() };
        if (street_address !== undefined) updates.street_address = street_address;
        if (city !== undefined) updates.city = city;
        if (state !== undefined) updates.state = state;
        if (postal_code !== undefined) updates.postal_code = postal_code;
        if (country !== undefined) updates.country = country;

        // If setting as default, unset others first
        if (is_default === true) {
            await supabase
                .from('user_addresses')
                .update({ is_default: false, updated_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('is_default', true);
            updates.is_default = true;
        } else if (is_default === false) {
             updates.is_default = false;
        }

        if (Object.keys(updates).length === 1 && updates.updated_at) { // Only updated_at was set
            return res.status(400).json({ error: 'No address fields to update.' });
        }


        const { data: updatedAddress, error } = await supabase
            .from('user_addresses')
            .update(updates)
            .eq('id', addressId)
            .eq('user_id', userId) // Crucial: ensure user owns the address
            .select('*')
            .single();

        if (error) {
            console.error('Supabase error updating user address:', error.message);
            if (error.code === 'PGRST116') return res.status(404).json({ error: 'Address not found or does not belong to user.' });
            return res.status(500).json({ error: 'Database error updating address.' });
        }
        if (!updatedAddress) {
            return res.status(404).json({ error: 'Address not found or no changes made.' });
        }

        res.status(200).json(updatedAddress);
    } catch (error) {
        console.error('Error in updateAddress:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error updating address.' });
    }
};

export const deleteAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: addressId } = req.params; // Address ID from URL

        // Optional: Prevent deleting the last address or the default address if it's the only one
        const { data: currentAddresses, error: fetchError } = await supabase
            .from('user_addresses')
            .select('id, is_default')
            .eq('user_id', userId);

        if (fetchError) {
             console.error('Error fetching addresses for delete check:', fetchError.message);
             return res.status(500).json({ error: 'Error checking address count.' });
        }

        const targetAddress = currentAddresses.find(addr => addr.id === addressId);
        if (!targetAddress) {
             return res.status(404).json({ error: 'Address not found or does not belong to user.' });
        }

        if (currentAddresses.length === 1) {
             return res.status(400).json({ error: 'Cannot delete the last remaining address.' });
        }
        if (targetAddress.is_default && currentAddresses.length > 1) {
             return res.status(400).json({ error: 'Cannot delete the default address. Please set another address as default first.' });
        }


        const { error } = await supabase
            .from('user_addresses')
            .delete()
            .eq('id', addressId)
            .eq('user_id', userId); // Crucial: ensure user owns the address

        if (error) {
            console.error('Supabase error deleting user address:', error.message);
            return res.status(500).json({ error: 'Database error deleting address.' });
        }

        res.status(200).json({ message: 'Address deleted successfully.' }); // Consistent success message
    } catch (error) {
        console.error('Error in deleteAddress:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error deleting address.' });
    }
};