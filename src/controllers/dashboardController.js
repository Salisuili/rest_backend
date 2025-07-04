// backend/controllers/dashboardController.js
import supabase from '../config/supabase.js';

export const getDashboardStats = async (req, res) => {
  try {
    // 1. Fetch Total Orders
    const { count: totalOrders, error: ordersCountError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true }); // Get exact count

    if (ordersCountError) throw ordersCountError;

    // 2. Fetch Total Revenue (assuming 'orders' table has a 'total_amount' column)
    const { data: revenueData, error: revenueError } = await supabase
      .from('orders')
      .select('total_amount'); // Select all total_amount to sum them up

    if (revenueError) throw revenueError;
    const totalRevenue = revenueData.reduce((sum, order) => sum + order.total_amount, 0);

    // 3. Fetch Pending Orders
    const { count: pendingOrders, error: pendingOrdersError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'); // Filter by 'pending' status

    if (pendingOrdersError) throw pendingOrdersError;

    // 4. Fetch Total Menu Items
    const { count: totalMenuItems, error: menuItemsCountError } = await supabase
      .from('menu_items')
      .select('*', { count: 'exact', head: true });

    if (menuItemsCountError) throw menuItemsCountError;

    // 5. Fetch Recent Orders (e.g., last 5)
    // Assuming 'orders' table also has a 'customer_id' and 'created_at' and 'order_items' is related
    const { data: recentOrders, error: recentOrdersError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total_amount,
        status,
        created_at,
        users ( full_name )
      `) // Select user's full_name via join
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentOrdersError) throw recentOrdersError;

    const stats = [
      { title: 'Total Orders', value: totalOrders, icon: '📦' },
      { title: 'Total Revenue', value: totalRevenue, icon: '💰' },
      { title: 'Pending Orders', value: pendingOrders, icon: '⏱️' },
      { title: 'Menu Items', value: totalMenuItems, icon: '🍔' }
    ];

    res.status(200).json({ stats, recentOrders });

  } catch (error) {
    console.error('Server error in getDashboardStats:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};