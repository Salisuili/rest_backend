// backend/controllers/menuItemController.js
import supabase from '../config/supabase.js';
import fs from 'fs'; // Node.js file system module for file operations
import path from 'path'; // Node.js path module for path manipulation
import { fileURLToPath } from 'url'; // For ES Modules to get __dirname

// Get __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to construct the full path to an uploaded file on the server's file system
const getLocalFilePath = (imageUrl) => {
    // imageUrl from DB will be like '/uploads/filename.ext'
    // We need to resolve it to the actual file system path relative to the project root
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) {
        return null; // Not an uploaded file we manage or invalid format
    }
    // Path.basename gets 'filename.ext' from '/uploads/filename.ext'
    // path.join(__dirname, '../uploads', ...) assumes 'uploads' is parallel to 'src'
    return path.join(__dirname, '../uploads', path.basename(imageUrl));
};

// Helper to get the URL path to store in the database
const getDatabaseImageUrl = (filename) => {
    // This assumes your Express static middleware serves '/uploads' from 'backend/uploads'
    return `/uploads/${filename}`;
};


// --- Get All Menu Items (Public) ---
export const getMenuItems = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('menu_items')
            .select(`
                id,
                category_id,
                name,
                description,
                price,
                image_url,
                is_available,
                created_at,
                updated_at,
                categories ( name ) // Select all fields from menu_items and the name from the linked category
            `)
            .order('created_at', { ascending: false }); // Order by creation date, latest first

        if (error) {
            console.error('Supabase error fetching menu items:', error.message); // Use .message for error objects
            return res.status(500).json({ error: 'Failed to fetch menu items from database.' });
        }

        // Supabase will return category as an object { name: "Category Name" }
        // Flatten it for easier use on frontend (e.g., item.category_name)
        const formattedData = data.map(item => ({
            ...item,
            category_name: item.categories ? item.categories.name : 'Uncategorized',
            categories: undefined // Remove the nested categories object
        }));

        res.status(200).json(formattedData);
    } catch (error) {
        console.error('Server error in getMenuItems:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// --- Create Menu Item (Admin Only) ---
export const createMenuItem = async (req, res) => {
    try {
        const { category_id, name, description, price, is_available } = req.body; // image_url is now from req.file
        let image_url = null; // Initialize image_url to null

        // Basic validation
        if (!name || !price || !category_id) {
            // If validation fails, delete the uploaded file if it exists
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting uploaded file after validation error:', err);
                });
            }
            return res.status(400).json({ error: 'Name, price, and category are required for a menu item.' });
        }
        if (isNaN(price) || parseFloat(price) <= 0) {
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting uploaded file after price validation error:', err);
                });
            }
            return res.status(400).json({ error: 'Price must be a positive number.' });
        }

        // If a file was uploaded by multer, set the image_url
        if (req.file) {
            image_url = getDatabaseImageUrl(req.file.filename);
        }

        const { data: newMenuItem, error } = await supabase
            .from('menu_items')
            .insert([{
                category_id,
                name,
                description,
                price: parseFloat(price), // Ensure price is stored as a number
                image_url, // Store the URL path
                is_available: is_available !== undefined ? (is_available === 'true' || is_available === true) : true // Default to true if not provided, handle string 'true'/'false'
            }])
            .select(`
                *,
                categories ( name ) // Select the category name for the response
            `)
            .single(); // Expecting one inserted record

        if (error) {
            // If Supabase insert fails, delete the uploaded file to prevent orphans
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting uploaded file after DB error:', err);
                });
            }
            console.error('Supabase error creating menu item:', error.message);
            if (error.code === '23505') { // Unique violation code (if name is unique)
                return res.status(409).json({ error: 'Menu item with this name already exists.' });
            }
            if (error.code === '23503') { // Foreign key violation (if category_id doesn't exist)
                return res.status(400).json({ error: 'Invalid category ID provided.' });
            }
            return res.status(500).json({ error: 'Failed to create menu item in database.' });
        }

        if (!newMenuItem) {
            // This case should ideally be caught by error.code in Supabase, but as a safeguard
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting uploaded file after no data returned:', err);
                });
            }
            throw new Error('Menu item creation failed: No data returned.');
        }

        const formattedNewItem = {
            ...newMenuItem,
            category_name: newMenuItem.categories ? newMenuItem.categories.name : 'Uncategorized',
            categories: undefined
        };

        res.status(201).json(formattedNewItem);

    } catch (error) {
        // Catch any unexpected errors in the controller logic itself
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting uploaded file after general error:', err);
            });
        }
        console.error('Server error in createMenuItem:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// --- Update Menu Item (Admin Only) ---
export const updateMenuItem = async (req, res) => {
    try {
        const { id } = req.params;
        // existing_image_url is sent from frontend if no new file is selected
        const { category_id, name, description, price, is_available, existing_image_url } = req.body;
        let new_image_url = existing_image_url; // Default to existing if no new file is uploaded

        // Basic validation (adjust as per your frontend's update logic)
        if (!name || !price || !category_id) {
            if (req.file) { // If new file was uploaded but validation fails
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting newly uploaded file after validation error:', err);
                });
            }
            return res.status(400).json({ error: 'Name, price, and category are required for a menu item update.' });
        }
        if (isNaN(price) || parseFloat(price) <= 0) {
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting newly uploaded file after price validation error:', err);
                });
            }
            return res.status(400).json({ error: 'Price must be a positive number.' });
        }

        // Fetch current menu item to get its old image_url
        const { data: currentMenuItem, error: fetchError } = await supabase
            .from('menu_items')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError) {
            if (req.file) { // If new file was uploaded but item not found
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting newly uploaded file (item not found):', err);
                });
            }
            console.error('Supabase error fetching current menu item for update:', fetchError.message);
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        // Handle image update logic
        if (req.file) {
            // A new file was uploaded. Delete the old one if it exists.
            if (currentMenuItem.image_url) {
                const oldImagePath = getLocalFilePath(currentMenuItem.image_url);
                if (oldImagePath && fs.existsSync(oldImagePath)) {
                    fs.unlink(oldImagePath, (err) => {
                        if (err) console.warn('Could not delete old image file:', oldImagePath, err);
                    });
                }
            }
            new_image_url = getDatabaseImageUrl(req.file.filename); // Set new image URL
        } else if (existing_image_url === null || existing_image_url === undefined || existing_image_url === '') {
            // No new file uploaded, and existing_image_url was explicitly cleared by frontend
            if (currentMenuItem.image_url) {
                const oldImagePath = getLocalFilePath(currentMenuItem.image_url);
                if (oldImagePath && fs.existsSync(oldImagePath)) {
                    fs.unlink(oldImagePath, (err) => {
                        if (err) console.warn('Could not delete old image file (cleared):', oldImagePath, err);
                    });
                }
            }
            new_image_url = null; // Clear image_url in DB
        }
        // If req.file is null and existing_image_url is not cleared, new_image_url remains existing_image_url


        const { data: updatedMenuItem, error } = await supabase
            .from('menu_items')
            .update({
                category_id,
                name,
                description,
                price: parseFloat(price),
                image_url: new_image_url, // Use the determined image URL
                is_available: is_available !== undefined ? (is_available === 'true' || is_available === true) : undefined, // Handle boolean conversion, or leave undefined if not provided
                updated_at: new Date().toISOString() // Always update timestamp
            })
            .eq('id', id)
            .select(`
                *,
                categories ( name )
            `)
            .single();

        if (error) {
            // If Supabase update fails, and a new file was uploaded, delete it
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting newly uploaded file after DB error:', err);
                });
            }
            console.error('Supabase error updating menu item:', error.message);
            if (error.code === '23505') { // Unique constraint violation
                return res.status(409).json({ error: 'Menu item with this name already exists.' });
            }
            if (error.code === '23503') { // Foreign key violation (if category_id doesn't exist)
                return res.status(400).json({ error: 'Invalid category ID provided.' });
            }
            return res.status(500).json({ error: 'Failed to update menu item.' });
        }

        if (!updatedMenuItem) {
            // This case should ideally be caught by error.code in Supabase, but as a safeguard
            if (req.file) {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting newly uploaded file after no data returned:', err);
                });
            }
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const formattedUpdatedItem = {
            ...updatedMenuItem,
            category_name: updatedMenuItem.categories ? updatedMenuItem.categories.name : 'Uncategorized',
            categories: undefined
        };

        res.status(200).json(formattedUpdatedItem);

    } catch (error) {
        // Catch any unexpected errors in the controller logic itself
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting newly uploaded file after general error:', err);
            });
        }
        console.error('Server error in updateMenuItem:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// --- Toggle Menu Item Availability ---
export const toggleMenuItemAvailability = async (req, res) => {
    const { id } = req.params;
    const { is_available } = req.body; // Expecting boolean true/false

    if (typeof is_available !== 'boolean') {
        return res.status(400).json({ error: 'Invalid value for is_available. Must be true or false.' });
    }

    try {
        const { data, error } = await supabase
            .from('menu_items')
            .update({ is_available, updated_at: new Date().toISOString() }) // Also update updated_at
            .eq('id', id)
            .select(`
                *,
                categories ( name )
            `)
            .single(); // Use .single() if you expect one record back

        if (error) {
            console.error('Supabase error updating menu item availability:', error.message);
            return res.status(500).json({ error: 'Failed to update menu item availability.' });
        }
        if (!data) { // Check for null data instead of data.length === 0 with .single()
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const updatedItem = {
            ...data, // data is already the single object from .single()
            category_name: data.categories ? data.categories.name : 'Uncategorized',
            categories: undefined
        };

        res.status(200).json(updatedItem);
    } catch (error) {
        console.error('Server error in toggleMenuItemAvailability:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// --- Delete Menu Item ---
export const deleteMenuItem = async (req, res) => {
    const { id } = req.params;

    try {
        // First, fetch the menu item to get its image_url
        const { data: menuItemToDelete, error: fetchError } = await supabase
            .from('menu_items')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError) {
            console.error('Supabase error fetching menu item for deletion:', fetchError.message);
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        // Then, delete the menu item from the database
        const { error: deleteError } = await supabase
            .from('menu_items')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Supabase error deleting menu item:', deleteError.message);
            return res.status(500).json({ error: 'Failed to delete menu item.' });
        }

        // If database deletion is successful, delete the associated image file
        if (menuItemToDelete.image_url) {
            const imagePath = getLocalFilePath(menuItemToDelete.image_url);
            if (imagePath && fs.existsSync(imagePath)) { // Ensure file exists before attempting to delete
                fs.unlink(imagePath, (err) => {
                    if (err) console.warn('Could not delete image file:', imagePath, err);
                });
            }
        }

        res.status(204).send(); // No content to send back, just success
    } catch (error) {
        console.error('Server error in deleteMenuItem:', error.message);
        res.status(500).json({ error: 'Internal server error.' });
    }
};
