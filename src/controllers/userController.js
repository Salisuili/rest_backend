// backend/src/controllers/userController.js
import supabase from '../config/supabase.js';

// --- User Profile Management (for logged-in user to manage their OWN profile) ---

/**
 * Get the profile of the currently authenticated user.
 * @route GET /api/users/profile
 * @access Private (Authenticated User)
 */
export const getUserProfile = async (req, res) => {
    try {
        // req.user is populated by authMiddleware, containing the user's ID
        const { id: userId } = req.user;

        const { data: user, error } = await supabase
            .from('users')
            // Select specific fields for security and privacy, including 'role'
            .select('id, full_name, email, phone_number, created_at, updated_at, role')
            .eq('id', userId)
            .single();

        if (error || !user) {
            // Handle specific Supabase error for no rows found (e.g., user deleted)
            if (error?.code === 'PGRST116') {
                return res.status(404).json({ error: 'User profile not found.' });
            }
            console.error('Supabase error fetching user profile:', error?.message);
            return res.status(500).json({ error: 'Database error fetching user profile.' });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error('Error in getUserProfile:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error fetching profile.' });
    }
};

/**
 * Update the profile of the currently authenticated user.
 * @route PUT /api/users/profile
 * @access Private (Authenticated User)
 */
export const updateUserProfile = async (req, res) => {
    try {
        const { id: userId } = req.user; // User ID from authenticated session
        const { full_name, phone_number } = req.body; // Fields allowed for update

        const updates = { updated_at: new Date().toISOString() }; // Always update timestamp
        if (full_name !== undefined) updates.full_name = full_name;
        if (phone_number !== undefined) updates.phone_number = phone_number;

        // If no actual fields were provided for update (only timestamp was set)
        if (Object.keys(updates).length === 1 && updates.updated_at) {
            return res.status(400).json({ error: 'No user fields to update. Provide full_name or phone_number.' });
        }

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            // Return updated fields including role for consistency
            .select('id, full_name, email, phone_number, created_at, updated_at, role')
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

// --- Admin User Management (for administrators to manage ALL users) ---

/**
 * Get all users in the system.
 * @route GET /api/users
 * @access Private (Admin Only)
 */
export const getAllUsers = async (req, res) => {
    try {
        // Authorization check: Ensure only admins can access this route
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can view all users.' });
        }

        const { data: users, error } = await supabase
            .from('users')
            // Fetch necessary fields for admin view, using 'role' column
            .select('id, full_name, email, phone_number, role, created_at, updated_at')
            .order('created_at', { ascending: false }); // Order by creation date descending

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

/**
 * Get a single user by ID (for admin to view any user's details).
 * @route GET /api/users/:id
 * @access Private (Admin Only)
 */
export const getSingleUserById = async (req, res) => {
    try {
        const { id: targetUserId } = req.params; // ID of the user to fetch

        // Authorization check: Ensure only admins can view other user profiles directly
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can view other user profiles directly.' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id, full_name, email, phone_number, role, created_at, updated_at')
            .eq('id', targetUserId)
            .single();

        if (error) {
            console.error('Supabase error fetching single user by ID (admin):', error.message);
            if (error.code === 'PGRST116') { // Supabase code for no rows found
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

/**
 * Delete a user by ID.
 * @route DELETE /api/users/:id
 * @access Private (Admin Only)
 */
export const deleteUser = async (req, res) => {
    try {
        const { id: targetUserId } = req.params; // User ID to delete from URL parameter
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        // Authorization check: Ensure only admins can delete users
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can delete users.' });
        }

        // Safeguard: Prevent admin from deleting their own account
        if (currentUserId === targetUserId) {
            return res.status(400).json({ error: 'You cannot delete your own account through this interface.' });
        }

        // Fetch target user's role to apply specific safeguards
        const { data: targetUser, error: targetUserError } = await supabase
            .from('users')
            .select('role')
            .eq('id', targetUserId)
            .single();

        if (targetUserError || !targetUser) {
            return res.status(404).json({ error: 'User to delete not found.' });
        }

        // Safeguard: Prevent deleting the last administrator account
        if (targetUser.role === 'admin') {
            const { count: adminCount, error: countError } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true }) // Count all admins
                .eq('role', 'admin');

            if (countError) console.error("Error counting admins for delete check:", countError.message);

            if (adminCount <= 1) { // If this is the only admin, prevent deletion
                return res.status(400).json({ error: 'Cannot delete the last administrator account.' });
            }
        }

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', targetUserId);

        if (error) {
            console.error('Supabase error deleting user:', error.message);
            // Handle specific errors, e.g., foreign key constraints (user has associated data)
            if (error.code === '23503') { // Foreign key violation
                return res.status(400).json({ error: 'Cannot delete user: Associated data (e.g., orders, addresses) exists. Consider deactivating or anonymizing the user instead.' });
            }
            return res.status(500).json({ error: 'Database error deleting user.' });
        }

        res.status(200).json({ message: 'User deleted successfully.' }); // Use 200 with message for better feedback
    } catch (error) {
        console.error('Error in deleteUser (admin):', error.message);
        res.status(500).json({ error: error.message || 'Internal server error deleting user.' });
    }
};

/**
 * Update a user's role by ID.
 * @route PUT /api/users/:id/role
 * @access Private (Admin Only)
 */
export const updateUserRole = async (req, res) => {
    try {
        const { id: targetUserId } = req.params; // User ID to update
        const { role: newRole } = req.body; // New role
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        // Authorization: Only admin can update roles
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can update user roles.' });
        }

        // Validation: Check if the provided role is valid
        const validRoles = ['admin', 'customer', 'driver', 'staff']; // Define your valid roles
        if (!newRole || !validRoles.includes(newRole)) {
            return res.status(400).json({ error: `Invalid role provided. Valid roles are: ${validRoles.join(', ')}.` });
        }

        // Fetch target user's current role for safeguards
        const { data: targetUser, error: targetUserError } = await supabase
            .from('users')
            .select('role')
            .eq('id', targetUserId)
            .single();

        if (targetUserError || !targetUser) {
            return res.status(404).json({ error: 'User to update not found.' });
        }

        // Safeguard: Prevent an admin from changing their own role (especially demoting)
        if (targetUserId === currentUserId && newRole !== 'admin') {
            return res.status(400).json({ error: 'You cannot demote your own admin account.' });
        }

        // Safeguard: Prevent demoting the last admin if there's only one
        if (targetUser.role === 'admin' && newRole !== 'admin') {
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
            .update({ role: newRole, updated_at: new Date().toISOString() })
            .eq('id', targetUserId)
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


// --- User Address Management Functions (for authenticated user to manage their OWN addresses) ---

/**
 * Get all addresses for the currently authenticated user.
 * @route GET /api/users/me/addresses
 * @access Private (Authenticated User)
 */
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
            return res.status(500).json({ error: 'Database error fetching user addresses.' });
        }

        res.status(200).json(addresses);
    } catch (error) {
        console.error('Error in getUserAddresses:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error fetching addresses.' });
    }
};

/**
 * Add a new address for the currently authenticated user.
 * @route POST /api/users/me/addresses
 * @access Private (Authenticated User)
 */
export const addUserAddress = async (req, res) => {
    try {
        const userId = req.user.id;

        // IMPORTANT: Ensure userId is present from authMiddleware
        if (!userId) {
            console.error('addUserAddress: userId is missing from req.user. This indicates an authMiddleware or token issue.');
            return res.status(401).json({ error: 'Authentication required. User ID not found in session.' });
        }

        const { street_address, city, state, postal_code, country, is_default } = req.body;

        // Backend validation for required fields
        if (!street_address || !city || !country) {
            return res.status(400).json({ error: 'Street address, city, and country are required.' });
        }

        // If the new address is set as default, unset previous default for this user
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
                user_id: userId, // Link to the authenticated user
                street_address,
                city,
                // FIX: Ensure 'state' is an empty string if not provided, instead of null,
                // as your DB schema defines 'state' as NOT NULL.
                state: state || '', // Changed from `state || null` to `state || ''`
                postal_code: postal_code || null, // Allow postal_code to be null
                country,
                is_default: is_default || false, // Default to false if not explicitly true
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select('*') // Select the newly inserted row to return it
            .single(); // Expect only one row to be inserted

        if (error) {
            // --- CRITICAL DEBUGGING LOGGING ---
            console.error('Supabase error adding user address:');
            console.error('  Message:', error.message);
            console.error('  Code:', error.code); // PostgreSQL error code (e.g., '23502' for NOT NULL violation)
            console.error('  Details:', error.details); // More specific error details
            console.error('  Hint:', error.hint); // Hint for fixing the error
            // --- END CRITICAL DEBUGGING LOGGING ---

            // Provide more specific error responses based on common PostgreSQL error codes
            if (error.code === '23502') { // Not Null Violation
                return res.status(400).json({ error: `Missing required field or invalid data: ${error.details || error.message}` });
            }
            if (error.code === '23503') { // Foreign Key Violation (e.g., user_id does not exist in 'users' table)
                return res.status(400).json({ error: `Invalid user ID or other foreign key constraint violation: ${error.details || error.message}` });
            }
            if (error.code === '22P02') { // Invalid Text Representation (e.g., trying to insert non-UUID into UUID column)
                return res.status(400).json({ error: `Invalid data format: ${error.details || error.message}` });
            }
            // Generic database error for other unhandled cases
            return res.status(500).json({ error: 'Database error adding user address: ' + error.message });
        }

        res.status(201).json(newAddress); // Return the newly created address

    } catch (error) {
        // Catch any unexpected errors in the controller logic itself (e.g., `req.user.id` is undefined)
        console.error('Error in addUserAddress (controller catch block):', error.message);
        res.status(500).json({ error: error.message || 'Internal server error adding address.' });
    }
};

/**
 * Update an existing address for the currently authenticated user.
 * @route PUT /api/users/me/addresses/:id
 * @access Private (Authenticated User)
 */
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
                .eq('is_default', true); // Only unset the one that is currently default
            updates.is_default = true; // Set the current address to default
        } else if (is_default === false) {
             updates.is_default = false; // Explicitly unset default
        }

        // Check if any actual fields were provided for update
        if (Object.keys(updates).length === 1 && updates.updated_at) {
            return res.status(400).json({ error: 'No address fields to update.' });
        }

        const { data: updatedAddress, error } = await supabase
            .from('user_addresses')
            .update(updates)
            .eq('id', addressId)
            .eq('user_id', userId) // Crucial: ensure user owns the address they are trying to update
            .select('*')
            .single();

        if (error) {
            console.error('Supabase error updating user address:', error.message);
            if (error.code === 'PGRST116') return res.status(404).json({ error: 'Address not found or does not belong to your account.' });
            // More specific error handling for DB constraints if needed
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

/**
 * Delete an address for the currently authenticated user.
 * @route DELETE /api/users/me/addresses/:id
 * @access Private (Authenticated User)
 */
export const deleteAddress = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id: addressId } = req.params; // Address ID from URL

        // Fetch all addresses for the user to apply safeguards
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
             return res.status(404).json({ error: 'Address not found or does not belong to your account.' });
        }

        // Safeguard: Prevent deleting the last remaining address
        if (currentAddresses.length === 1) {
             return res.status(400).json({ error: 'Cannot delete the last remaining address. You must have at least one address.' });
        }
        // Safeguard: Prevent deleting the default address if there are other addresses
        if (targetAddress.is_default && currentAddresses.length > 1) {
             return res.status(400).json({ error: 'Cannot delete the default address. Please set another address as default first.' });
        }

        const { error } = await supabase
            .from('user_addresses')
            .delete()
            .eq('id', addressId)
            .eq('user_id', userId); // Crucial: ensure user owns the address they are trying to delete

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
