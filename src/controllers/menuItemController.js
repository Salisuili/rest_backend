import supabase from '../config/supabase.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getLocalFilePath = (imageUrl) => {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) {
        return null;
    }
    return path.join(__dirname, '../uploads', path.basename(imageUrl));
};

const getDatabaseImageUrl = (filename) => {
    return `/uploads/${filename}`;
};

export const uploadMenuItemImage = (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }
        const imageUrl = getDatabaseImageUrl(req.file.filename);
        res.status(200).json({ imageUrl });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error during image upload.' });
    }
};

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
                categories ( name )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ error: 'Failed to fetch menu items from database.' });
        }

        const formattedData = data.map(item => ({
            ...item,
            category_name: item.categories ? item.categories.name : 'Uncategorized',
            categories: undefined
        }));

        res.status(200).json(formattedData);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
};

export const getMenuItemById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: menuItem, error } = await supabase
            .from('menu_items')
            .select(`
                *,
                categories ( name )
            `)
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ error: 'Menu item not found.' });
            }
            return res.status(500).json({ error: 'Database error fetching menu item.' });
        }

        if (!menuItem) {
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const formattedItem = {
            ...menuItem,
            category_name: menuItem.categories ? menuItem.categories.name : 'Uncategorized',
            categories: undefined
        };

        res.status(200).json(formattedItem);

    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
};

export const createMenuItem = async (req, res) => {
    try {
        const { category_id, name, description, price, is_available, image_url } = req.body;

        if (!name || !price || !category_id) {
            return res.status(400).json({ error: 'Name, price, and category are required for a menu item.' });
        }
        if (isNaN(price) || parseFloat(price) <= 0) {
            return res.status(400).json({ error: 'Price must be a positive number.' });
        }

        const { data: newMenuItem, error } = await supabase
            .from('menu_items')
            .insert([{
                category_id,
                name,
                description,
                price: parseFloat(price),
                image_url,
                is_available: is_available !== undefined ? (is_available === 'true' || is_available === true) : true
            }])
            .select(`
                *,
                categories ( name )
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Menu item with this name already exists.' });
            }
            if (error.code === '23503') {
                return res.status(400).json({ error: 'Invalid category ID provided.' });
            }
            return res.status(500).json({ error: 'Failed to create menu item in database.' });
        }

        if (!newMenuItem) {
            throw new Error('Menu item creation failed: No data returned.');
        }

        const formattedNewItem = {
            ...newMenuItem,
            category_name: newMenuItem.categories ? newMenuItem.categories.name : 'Uncategorized',
            categories: undefined
        };

        res.status(201).json(formattedNewItem);

    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
};

export const updateMenuItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { category_id, name, description, price, is_available, image_url } = req.body;

        if (!name || !price || !category_id) {
            return res.status(400).json({ error: 'Name, price, and category are required for a menu item update.' });
        }
        if (isNaN(price) || parseFloat(price) <= 0) {
            return res.status(400).json({ error: 'Price must be a positive number.' });
        }

        const { data: currentMenuItem, error: fetchError } = await supabase
            .from('menu_items')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError) {
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const oldImageUrl = currentMenuItem.image_url;
        
        if (image_url && oldImageUrl && image_url !== oldImageUrl) {
            const oldImagePath = getLocalFilePath(oldImageUrl);
            if (oldImagePath && fs.existsSync(oldImagePath)) {
                fs.unlink(oldImagePath, (err) => {
                    if (err) console.warn('Could not delete old image file:', oldImagePath, err);
                });
            }
        } else if (!image_url && oldImageUrl) {
            const oldImagePath = getLocalFilePath(oldImageUrl);
            if (oldImagePath && fs.existsSync(oldImagePath)) {
                fs.unlink(oldImagePath, (err) => {
                    if (err) console.warn('Could not delete old image file (cleared):', oldImagePath, err);
                });
            }
        }

        const { data: updatedMenuItem, error } = await supabase
            .from('menu_items')
            .update({
                category_id,
                name,
                description,
                price: parseFloat(price),
                image_url,
                is_available: is_available !== undefined ? (is_available === 'true' || is_available === true) : undefined,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select(`
                *,
                categories ( name )
            `)
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Menu item with this name already exists.' });
            }
            if (error.code === '23503') {
                return res.status(400).json({ error: 'Invalid category ID provided.' });
            }
            return res.status(500).json({ error: 'Failed to update menu item.' });
        }

        if (!updatedMenuItem) {
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const formattedUpdatedItem = {
            ...updatedMenuItem,
            category_name: updatedMenuItem.categories ? updatedMenuItem.categories.name : 'Uncategorized',
            categories: undefined
        };

        res.status(200).json(formattedUpdatedItem);

    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
};

export const toggleMenuItemAvailability = async (req, res) => {
    const { id } = req.params;
    const { is_available } = req.body;

    if (typeof is_available !== 'boolean') {
        return res.status(400).json({ error: 'Invalid value for is_available. Must be true or false.' });
    }

    try {
        const { data, error } = await supabase
            .from('menu_items')
            .update({ is_available, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select(`
                *,
                categories ( name )
            `)
            .single();

        if (error) {
            return res.status(500).json({ error: 'Failed to update menu item availability.' });
        }
        if (!data) {
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const updatedItem = {
            ...data,
            category_name: data.categories ? data.categories.name : 'Uncategorized',
            categories: undefined
        };

        res.status(200).json(updatedItem);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
};

export const deleteMenuItem = async (req, res) => {
    const { id } = req.params;

    try {
        const { data: menuItemToDelete, error: fetchError } = await supabase
            .from('menu_items')
            .select('image_url')
            .eq('id', id)
            .single();

        if (fetchError) {
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const { error: deleteError } = await supabase
            .from('menu_items')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return res.status(500).json({ error: 'Failed to delete menu item.' });
        }

        if (menuItemToDelete.image_url) {
            const imagePath = getLocalFilePath(menuItemToDelete.image_url);
            if (imagePath && fs.existsSync(imagePath)) {
                fs.unlink(imagePath, (err) => {
                    if (err) console.warn('Could not delete image file:', imagePath, err);
                });
            }
        }

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
};
