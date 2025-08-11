// backend/src/controllers/orderController.js
import supabase from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid'; // For generating unique order numbers
import axios from 'axios'; // Import axios for external API calls like Paystack

/**
 * Creates a new order and its associated order items.
 * @route POST /api/orders
 * @access Private (Authenticated User)
 */
export const createOrder = async (req, res) => {
    try {
        const userId = req.user.id; // User ID from authenticated session
        const { items, address_id, delivery_notes, is_pickup } = req.body; // Added is_pickup

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required. User ID not found.' });
        }
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Order must contain at least one item.' });
        }
        // Address ID is required only if it's a delivery order
        if (!is_pickup && !address_id) {
            console.error('createOrder: Triggered "Delivery address is required" error. is_pickup was', is_pickup, 'and address_id was', address_id);
            return res.status(400).json({ error: 'Delivery address is required for delivery orders.' });
        }

        // Calculate subtotal from items
        let subtotal = 0;
        // Fetch actual prices from menu_items to prevent client-side price manipulation
        const itemIds = items.map(item => item.id);
        const { data: menuItemsData, error: menuItemsError } = await supabase
            .from('menu_items')
            .select('id, price')
            .in('id', itemIds);

        if (menuItemsError) {
            console.error('Supabase error fetching menu item prices:', menuItemsError.message);
            return res.status(500).json({ error: 'Database error fetching menu item prices.' });
        }

        const menuItemPrices = new Map(menuItemsData.map(item => [item.id, item.price]));

        const orderItemsToInsert = [];
        for (const item of items) {
            const actualPrice = menuItemPrices.get(item.id);
            if (actualPrice === undefined) {
                return res.status(400).json({ error: `Menu item with ID ${item.id} not found or invalid.` });
            }
            subtotal += actualPrice * item.quantity;
            orderItemsToInsert.push({
                menu_item_id: item.id,
                quantity: item.quantity,
                price_at_order: actualPrice, // Store the actual price at the time of order
                special_instructions: item.special_instructions || null,
                created_at: new Date().toISOString()
            });
        }

        // Calculate delivery fee conditionally - SYNCHRONIZED WITH FRONTEND
        let delivery_fee = 0; // Default to 0 for pickup or if no delivery is selected

        if (!is_pickup) { // If it's a delivery order
            // Fetch address details to calculate delivery fee based on city
            const { data: address, error: addressError } = await supabase
                .from('user_addresses')
                .select('id, city')
                .eq('id', address_id)
                .eq('user_id', userId) // Security: Ensure address belongs to the current user
                .single();

            if (addressError || !address) {
                console.error("Supabase error fetching delivery address for fee calculation:", addressError?.message);
                return res.status(404).json({ error: 'Delivery address not found or does not belong to your account.' });
            }

            // Apply the delivery fee logic to match the frontend (Zaria vs. Others)
            if (address.city.toLowerCase() === 'zaria') { // Matching frontend: Zaria logic
                delivery_fee = subtotal >= 5000 ? 0 : 500;
            } else { // Matching frontend: All other cities logic
                delivery_fee = 1000;
            }
        }
        // If is_pickup is true, delivery_fee remains 0 as initialized

        const total_amount = subtotal + delivery_fee;
        const order_number = `ORD-${uuidv4().substring(0, 8).toUpperCase()}`; // Generate a unique order number

        // 1. Insert into 'orders' table
        const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert([{
                user_id: userId,
                address_id: is_pickup ? null : address_id, // Store address_id only if it's a delivery
                order_number: order_number,
                status: 'pending', // Initial status
                subtotal: subtotal,
                delivery_fee: delivery_fee, // Store the calculated delivery fee
                total_amount: total_amount,
                payment_status: 'pending', // Initialize payment status
                delivery_notes: delivery_notes || null,
                is_pickup: is_pickup, // Store the pickup status
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select('*') // Select the newly created order
            .single();

        if (orderError) {
            console.error('Supabase error creating order:', orderError.message);
            console.error('   Code:', orderError.code);
            console.error('   Details:', orderError.details);
            console.error('   Hint:', orderError.hint);
            return res.status(500).json({ error: 'Database error creating order.' });
        }

        // 2. Insert into 'order_items' table, linking to the new order
        const orderItemsWithOrderId = orderItemsToInsert.map(item => ({
            ...item,
            order_id: newOrder.id // Link each item to the newly created order
        }));

        const { data: insertedOrderItems, error: orderItemsError } = await supabase
            .from('order_items')
            .insert(orderItemsWithOrderId)
            .select('*'); // Select the inserted order items

        if (orderItemsError) {
            console.error('Supabase error inserting order items:', orderItemsError.message);
            console.error('   Code:', orderItemsError.code);
            console.error('   Details:', orderItemsError.details);
            console.error('   Hint:', orderItemsError.hint);
            // Optional: Rollback the main order if order items insertion fails
            await supabase.from('orders').delete().eq('id', newOrder.id);
            return res.status(500).json({ error: 'Database error creating order items. Order rolled back.' });
        }

        // Return the created order details along with its items
        res.status(201).json({ ...newOrder, items: insertedOrderItems });

    } catch (error) {
        console.error('Error in createOrder:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error during order creation.' });
    }
};

/**
 * Get a single order by ID (for authenticated user or admin).
 * @route GET /api/orders/:id
 * @access Private (Authenticated User or Admin)
 */
export const getOrderById = async (req, res) => {
    try {
        const { id: orderId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        const { data: order, error } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(name, price, image_url)), user_addresses(*)')
            .eq('id', orderId)
            .single();

        if (error || !order) {
            if (error?.code === 'PGRST116') {
                return res.status(404).json({ error: 'Order not found.' });
            }
            console.error('Supabase error fetching order by ID:', error?.message);
            return res.status(500).json({ error: 'Database error fetching order.' });
        }

        // Authorization check: User can only view their own orders unless they are an admin
        if (order.user_id !== userId && userRole !== 'admin') {
            return res.status(403).json({ error: 'Access denied. You are not authorized to view this order.' });
        }

        res.status(200).json(order);
    } catch (error) {
        console.error('Error in getOrderById:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error fetching order.' });
    }
};

/**
 * Get all orders for the authenticated user.
 * @route GET /api/orders/my-orders
 * @access Private (Authenticated User)
 */
export const getMyOrders = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data: orders, error } = await supabase
            .from('orders')
            .select('*, order_items(*, menu_items(name, price, image_url)), user_addresses(street_address, city, state, country)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error fetching user orders:', error.message);
            return res.status(500).json({ error: 'Database error fetching user orders.' });
        }

        res.status(200).json(orders);
    } catch (error) {
        console.error('Error in getMyOrders:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error fetching user orders.' });
    }
};

/**
 * Get all orders (Admin only).
 * @route GET /api/orders
 * @access Private (Admin Only)
 */
export const getAllOrders = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can view all orders.' });
        }

        const { data: orders, error } = await supabase
            .from('orders')
            .select('*, users(full_name, email), user_addresses(street_address, city, state, country), order_items(*, menu_items(name, price, image_url))')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase error fetching all orders (admin):', error.message);
            return res.status(500).json({ error: 'Database error fetching all orders.' });
        }

        res.status(200).json(orders);
    } catch (error) {
        console.error('Error in getAllOrders (admin):', error.message);
        res.status(500).json({ error: error.message || 'Internal server error fetching all orders.' });
    }
};

/**
 * Update order status (Admin only).
 * @route PUT /api/orders/:id/status
 * @access Private (Admin Only)
 */
export const updateOrderStatus = async (req, res) => {
    try {
        const { id: orderId } = req.params;
        const { status } = req.body;

        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Only administrators can update order status.' });
        }

        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: `Invalid status provided. Valid statuses are: ${validStatuses.join(', ')}.` });
        }

        const { data: updatedOrder, error } = await supabase
            .from('orders')
            .update({ status: status, updated_at: new Date().toISOString() })
            .eq('id', orderId)
            .select('*')
            .single();

        if (error) {
            console.error('Supabase error updating order status:', error.message);
            return res.status(500).json({ error: 'Database error updating order status.' });
        }
        if (!updatedOrder) {
            return res.status(404).json({ error: 'Order not found or no changes made.' });
        }

        res.status(200).json({ message: 'Order status updated successfully.', order: updatedOrder });
    } catch (error) {
        console.error('Error in updateOrderStatus:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error updating order status.' });
    }
};

/**
 * Initiate payment for an order (e.g., Paystack integration).
 * @route POST /api/orders/:id/initiate-payment
 * @access Private (Authenticated User)
 */
export const initiatePayment = async (req, res) => {
    try {
        const { id: orderId } = req.params;
        const { email } = req.body; // Email for payment gateway

        const userId = req.user.id;

        // Fetch order details to get total amount and verify ownership
        const { data: order, error: orderFetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderFetchError || !order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Ensure the order belongs to the authenticated user
        if (order.user_id !== userId) {
            return res.status(403).json({ error: 'Access denied. You are not authorized to initiate payment for this order.' });
        }

        if (order.payment_status === 'paid') {
            return res.status(400).json({ error: 'Payment for this order has already been completed.' });
        }

        // --- Paystack Integration (Example) ---
        // You would typically use a library like 'node-paystack' or 'axios' to make a request to Paystack's API
        // For demonstration, this is a placeholder. Replace with actual Paystack API calls.
        const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY; // Ensure this env var is set on Render

        if (!paystackSecretKey) {
            console.error('PAYSTACK_SECRET_KEY is not set.');
            return res.status(500).json({ error: 'Payment gateway not configured. Please contact support.' });
        }

        const paystackResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: email,
                amount: order.total_amount * 100, // Amount in kobo (for NGN)
                order_id: order.id, // Custom data to link payment to order
                callback_url: `${process.env.FRONTEND_URL}/order-confirmation/${order.id}` // Redirect after payment
            },
            {
                headers: {
                    Authorization: `Bearer ${paystackSecretKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (paystackResponse.data && paystackResponse.data.status) {
            // Update order with payment reference and status (e.g., 'initiated')
            await supabase
                .from('orders')
                .update({
                    payment_reference: paystackResponse.data.data.reference,
                    payment_status: 'initiated',
                    updated_at: new Date().toISOString()
                })
                .eq('id', order.id);

            res.status(200).json(paystackResponse.data.data); // Return authorization_url
        } else {
            console.error('Paystack initialization failed:', paystackResponse.data);
            return res.status(500).json({ error: paystackResponse.data.message || 'Failed to initiate payment with Paystack.' });
        }

    } catch (error) {
        console.error('Error initiating payment:', error.message);
        // If it's an Axios error from Paystack API call
        if (error.response) {
            console.error('Paystack API Error Response:', error.response.data);
            return res.status(error.response.status).json({ error: error.response.data.message || 'Payment initiation failed.' });
        }
        res.status(500).json({ error: error.message || 'Internal server error initiating payment.' });
    }
};

/**
 * Verify payment status (Paystack webhook or manual verification).
 * @route GET /api/orders/:id/verify-payment
 * @access Private (Authenticated User or Webhook)
 */
export const verifyPayment = async (req, res) => {
    try {
        const { id: orderId } = req.params;
        // In a real scenario, you'd get the reference from Paystack webhook or query params
        // For manual verification, you might pass the reference or fetch it from the order
        const { reference } = req.query; // Assuming reference is passed as a query param

        const userId = req.user.id; // For authorization if manual verification

        // Fetch order details
        const { data: order, error: orderFetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderFetchError || !order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // Authorization: Only owner or admin can verify payment, or if it's a webhook (no userId)
        if (userId && order.user_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. You are not authorized to verify payment for this order.' });
        }

        const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!paystackSecretKey) {
            console.error('PAYSTACK_SECRET_KEY is not set.');
            return res.status(500).json({ error: 'Payment gateway not configured.' });
        }

        const paystackVerificationResponse = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference || order.payment_reference}`,
            {
                headers: {
                    Authorization: `Bearer ${paystackSecretKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (paystackVerificationResponse.data && paystackVerificationResponse.data.data.status === 'success') {
            // Update order payment status to 'paid'
            await supabase
                .from('orders')
                .update({
                    payment_status: 'paid',
                    status: 'processing', // Move order to processing after successful payment
                    updated_at: new Date().toISOString()
                })
                .eq('id', order.id);

            res.status(200).json({ message: 'Payment verified successfully.', orderId: order.id, paymentStatus: 'paid' });
        } else {
            console.error('Paystack verification failed:', paystackVerificationResponse.data);
            // Update order payment status to 'failed' or 'pending' if not successful
            await supabase
                .from('orders')
                .update({
                    payment_status: paystackVerificationResponse.data.data.status || 'failed',
                    updated_at: new Date().toISOString()
                })
                .eq('id', order.id);
            return res.status(400).json({ error: paystackVerificationResponse.data.message || 'Payment verification failed.' });
        }

    } catch (error) {
        console.error('Error verifying payment:', error.message);
        if (error.response) {
            console.error('Paystack API Error Response:', error.response.data);
            return res.status(error.response.status).json({ error: error.response.data.message || 'Payment verification failed.' });
        }
        res.status(500).json({ error: error.message || 'Internal server error verifying payment.' });
    }
};
