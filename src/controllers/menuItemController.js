// backend/controllers/menuItemController.js
import supabase from '../config/supabase.js';

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
    const { category_id, name, description, price, image_url, is_available } = req.body;

    // Basic validation
    if (!name || !price || !category_id) {
      return res.status(400).json({ error: 'Name, price, and category are required for a menu item.' });
    }
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number.' });
    }

    const { data: newMenuItem, error } = await supabase
      .from('menu_items')
      .insert([{ 
        category_id, 
        name, 
        description, 
        price, 
        image_url, 
        is_available: is_available !== undefined ? is_available : true // Default to true if not provided
      }])
      .select(`
        *,
        categories ( name ) // Select the category name for the response
      `)
      .single(); // Expecting one inserted record

    if (error) {
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
        throw new Error('Menu item creation failed: No data returned.');
    }

    // Flatten the category name for the response
    const formattedNewItem = {
        ...newMenuItem,
        category_name: newMenuItem.categories ? newMenuItem.categories.name : 'Uncategorized',
        categories: undefined
    };

    res.status(201).json(formattedNewItem);

  } catch (error) {
    console.error('Server error in createMenuItem:', error.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// --- Get Menu Item By ID ---
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
      console.error('Supabase error fetching menu item by ID:', error.message);
      if (error.code === 'PGRST116') { // No rows found for .single()
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
    console.error('Server error in getMenuItemById:', error.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};


// --- Update Menu Item (Admin Only) ---
export const updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { category_id, name, description, price, image_url, is_available } = req.body;

    // Basic validation
    if (!name || !price || !category_id) {
      return res.status(400).json({ error: 'Name, price, and category are required for a menu item update.' });
    }
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number.' });
    }

    const { data: updatedMenuItem, error } = await supabase
      .from('menu_items')
      .update({ 
        category_id, 
        name, 
        description, 
        price, 
        image_url, 
        is_available 
      })
      .eq('id', id)
      .select(`
        *,
        categories ( name )
      `)
      .single();

    if (error) {
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
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    const formattedUpdatedItem = {
        ...updatedMenuItem,
        category_name: updatedMenuItem.categories ? updatedMenuItem.categories.name : 'Uncategorized',
        categories: undefined
    };

    res.status(200).json(formattedUpdatedItem);

  } catch (error) {
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
    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase error deleting menu item:', error.message);
      return res.status(500).json({ error: 'Failed to delete menu item.' });
    }

    res.status(204).send(); // No content to send back, just success
  } catch (error) {
    console.error('Server error in deleteMenuItem:', error.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};