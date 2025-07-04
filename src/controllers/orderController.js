// backend/controllers/orderController.js
import supabase from '../config/supabase.js';
import { initializePayment, verifyPayment } from '../config/paystack.js';
import { generateOrderNumber } from '../utils/generateOrderNumber.js';

export const createOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { items, address_id, delivery_notes } = req.body; 
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Order must contain items.' });
        }
        if (!address_id) { 
            return res.status(400).json({ error: 'Address ID is required for delivery.' });
        }

        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (isNaN(subtotal)) {
            return res.status(400).json({ error: 'Invalid item prices or quantities.' });
        }

        const deliveryFee = subtotal >= 5000 ? 0 : 1000;
        const total = subtotal + deliveryFee;

        const orderNumber = generateOrderNumber();

        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
                user_id: userId,
                order_number: orderNumber,
                address_id: address_id, // CHANGE: Use address_id
                delivery_notes,
                subtotal,
                delivery_fee: deliveryFee,
                total_amount: total,
                status: 'pending'
            }])
            .select('*')
            .single();

        if (orderError) {
            console.error('Supabase error creating order:', orderError.message);
            if (orderError.code === '23503') { // Foreign key violation if address_id or user_id doesn't exist
                return res.status(400).json({ error: 'Invalid user ID or address ID provided.' });
            }
            throw new Error(`Failed to create order: ${orderError.message}`);
        }
        if (!order) {
            throw new Error('Order creation failed: No order data returned.');
        }

        const orderItems = items.map(item => ({
            order_id: order.id,
            menu_item_id: item.id,
            quantity: item.quantity,
            price_at_order: item.price
        }));

        const { error: orderItemsError } = await supabase.from('order_items').insert(orderItems);

        if (orderItemsError) {
            console.error('Supabase error creating order items:', orderItemsError.message);
            throw new Error(`Failed to add order items: ${orderItemsError.message}`);
        }

        res.status(201).json(order);

    } catch (error) {
        console.error('Error in createOrder:', error.message);
        res.status(400).json({ error: error.message || 'An error occurred during order creation.' });
    }
};

export const initiatePayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userEmail = req.user.email;

        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError) {
            console.error('Supabase error fetching order for payment initiation:', orderError.message);
            if (orderError.code === 'PGRST116') {
                return res.status(404).json({ error: 'Order not found.' });
            }
            throw new Error('Database error fetching order for payment.');
        }
        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        if (order.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to initiate payment for this order.' });
        }

        if (order.status !== 'pending') {
            return res.status(400).json({ error: `Payment cannot be initiated for order in '${order.status}' status.` });
        }

        const paymentAmountInKobo = order.total_amount * 100;
        const payment = await initializePayment(userEmail, paymentAmountInKobo, {
            order_id: orderId,
            order_number: order.order_number
        });

        if (!payment || !payment.status || !payment.data || !payment.data.authorization_url || !payment.data.reference) {
            throw new Error('Failed to initialize payment with Paystack.');
        }

        const { error: updateError } = await supabase
            .from('orders')
            .update({ payment_reference: payment.data.reference })
            .eq('id', orderId);

        if (updateError) {
            console.error('Supabase error updating payment reference:', updateError.message);
        }

        res.json({ authorization_url: payment.data.authorization_url, reference: payment.data.reference });

    } catch (error) {
        console.error('Error in initiatePayment:', error.message);
        res.status(500).json({ error: error.message || 'An error occurred during payment initiation.' });
    }
};

export const getOrders = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit - 1;

    try {
        const { count: totalOrders, error: countError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error('Supabase error counting orders:', countError.message);
            throw new Error('Database error counting orders.');
        }

        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                total_amount,
                status,
                created_at,
                delivery_notes,
                payment_reference,
                users ( full_name, email ),
                user_addresses ( street_address, city, state, postal_code, country ) // <--- CHANGE: Select address details from user_addresses
            `)
            .order('created_at', { ascending: false })
            .range(startIndex, endIndex);

        if (ordersError) {
            console.error('Supabase error fetching paginated orders:', ordersError.message);
            throw new Error('Database error fetching orders.');
        }

        const totalPages = Math.ceil(totalOrders / limit);

        const formattedOrders = orders.map(order => ({
            ...order,
            customer_name: order.users ? order.users.full_name : 'N/A',
            customer_email: order.users ? order.users.email : 'N/A',
            delivery_address: order.user_addresses ? 
                              `${order.user_addresses.street_address}, ${order.user_addresses.city}, ${order.user_addresses.state}, ${order.user_addresses.country}` : 'N/A',
            users: undefined, 
            user_addresses: undefined 
        }));

        res.status(200).json({
            currentPage: page,
            totalPages: totalPages,
            totalOrders: totalOrders,
            orders: formattedOrders
        });

    } catch (error) {
        console.error('Server error in getOrders (Admin):', error.message);
        res.status(500).json({ error: error.message || 'Internal server error.' });
    }
};

export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    id,
                    menu_item_id,
                    quantity,
                    price_at_order,
                    menu_items ( name, description, image_url ) // Include image_url if needed
                ),
                users ( full_name, email ), // <--- Add user details
                user_addresses ( street_address, city, state, postal_code, country ) // <--- CHANGE: Select address details
            `)
            .eq('id', id)
            .single();

        if (orderError) {
            console.error('Supabase error fetching order by ID:', orderError.message);
            if (orderError.code === 'PGRST116') {
                return res.status(404).json({ error: 'Order not found.' });
            }
            return res.status(500).json({ error: 'Database error fetching order.' });
        }
        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        if (order.user_id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to view this order.' });
        }

        // CHANGE: Format the response to include flattened address and user data
        const formattedOrder = {
            ...order,
            customer_name: order.users ? order.users.full_name : 'N/A',
            customer_email: order.users ? order.users.email : 'N/A',
            delivery_address: order.user_addresses ? 
                              `${order.user_addresses.street_address}, ${order.user_addresses.city}, ${order.user_addresses.state}, ${order.user_addresses.country}` : 'N/A',
            users: undefined,
            user_addresses: undefined
        };


        res.status(200).json(formattedOrder);

    } catch (error) {
        console.error('Error in getOrderById:', error.message);
        res.status(500).json({ error: 'Internal server error fetching order.' });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['pending', 'processing', 'shipped', 'completed', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Valid order status is required.' });
        }

        const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update({ status: status, updated_at: new Date().toISOString() }) // Also update updated_at
            .eq('id', id)
            .select('*')
            .single();

        if (updateError) {
            console.error('Supabase error updating order status:', updateError.message);
            return res.status(500).json({ error: 'Database error updating order status.' });
        }
        if (!updatedOrder) {
            return res.status(404).json({ error: 'Order not found or no changes made.' });
        }

        res.status(200).json(updatedOrder);

    } catch (error) {
        console.error('Error in updateOrderStatus:', error.message);
        res.status(500).json({ error: error.message || 'Internal server error updating order status.' });
    }
};