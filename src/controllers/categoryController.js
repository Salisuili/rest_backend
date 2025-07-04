// backend/controllers/categoryController.js
import supabase from '../config/supabase.js'; // Assuming this is your Supabase client setup

// --- Get All Categories ---
export const getCategories = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('name', { ascending: true }); // Order by name for consistency

        if (error) {
            console.error('Supabase error fetching categories:', error.message); // Use .message for error objects
            return res.status(500).json({ error: 'Failed to fetch categories from database.' });
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Server error in getCategories:', error.message); // Use .message for error objects
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// --- Add Category (Admin Only) ---
export const createCategory = async (req, res) => {
    const { name, description, image_url } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Category name is required.' });
    }

    try {
        const { data: newCategory, error } = await supabase // Renamed data to newCategory for clarity
            .from('categories')
            .insert([{ name, description, image_url }])
            .select() // Select the inserted row to return it
            .single(); // Use .single() if you're inserting one row and expect one back

        if (error) {
            console.error('Supabase error creating category:', error.message); // Use .message
            if (error.code === '23505') { // Unique violation code (if name is unique)
                return res.status(409).json({ error: 'Category with this name already exists.' });
            }
            return res.status(500).json({ error: 'Failed to create category in database.' });
        }

        res.status(201).json(newCategory); // Return the single inserted record

    } catch (error) {
        console.error('Server error in createCategory:', error.message); // Use .message
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// --- Update Category (Admin Only) ---
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params; // Category ID from URL
        const { name, description, image_url } = req.body; // Updated data

        if (!name) { // Name is typically mandatory for a category update
            return res.status(400).json({ error: 'Category name is required for update.' });
        }

        const { data: updatedCategory, error } = await supabase
            .from('categories')
            .update({ name, description, image_url })
            .eq('id', id) // Identify the record to update by its ID
            .select() // Select the updated row to return it
            .single(); // Expecting one updated record

        if (error) {
            console.error('Supabase error updating category:', error.message);
            if (error.code === '23505') { // Unique constraint violation (e.g., trying to set a name that already exists)
                return res.status(409).json({ error: 'Category with this name already exists.' });
            }
            return res.status(500).json({ error: 'Database error updating category.' });
        }

        if (!updatedCategory) {
            // If no error, but no data, it means the category with that ID wasn't found
            return res.status(404).json({ error: 'Category not found.' });
        }

        res.status(200).json(updatedCategory); // Return the updated category

    } catch (error) {
        console.error('Server error in updateCategory:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// --- Delete Category (Admin Only) ---
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params; // Category ID from URL

        const { error } = await supabase
            .from('categories')
            .delete()
            .eq('id', id); // Delete the record matching the ID

        if (error) {
            console.error('Supabase error deleting category:', error.message);
            // Common error: Foreign key constraint violation (e.g., trying to delete a category that has menu items linked to it)
            if (error.code === '23503') { // PostgreSQL foreign key violation error code
                return res.status(409).json({ error: 'Cannot delete category: It is linked to existing menu items. Please remove or reassign menu items first.' });
            }
            return res.status(500).json({ error: 'Database error deleting category.' });
        }

        // Supabase delete operation doesn't return the deleted row by default.
        // If error is null, it means the delete command was successful.
        // We might return 204 No Content for a successful delete.
        res.status(204).send(); // 204 No Content for successful deletion

    } catch (error) {
        console.error('Server error in deleteCategory:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
};