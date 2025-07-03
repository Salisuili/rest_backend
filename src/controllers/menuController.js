import supabase from '../config/supabase.js';

export const getCategories = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMenuItems = async (req, res) => {
  try {
    const { categoryId, search } = req.query;
    let query = supabase
      .from('menu_items')
      .select('*, categories(name)');

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};