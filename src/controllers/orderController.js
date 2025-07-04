// backend/controllers/orderController.js
import supabase from '../config/supabase.js';
import { initializePayment, verifyPayment } from '../config/paystack.js'; // Assuming these are correctly configured
import { generateOrderNumber } from '../utils/generateOrderNumber.js'; // Assuming this utility exists

export const createOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { items, address_id, delivery_notes } = req.body;

        // 1. Basic input validation
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Order must contain items.' });
        }
        if (!address_id) {
            return res.status(400).json({ error: 'Delivery address ID is required.' });
        }

        // 2. Validate and Fetch Address Details (CRUCIAL for security and logic)
        const { data: address, error: addressError } = await supabase
            .from('user_addresses')
            .select('id, city') // Select ID and city for validation and delivery fee calculation
            .eq('id', address_id)
            .eq('user_id', userId) // Security: Ensure address belongs to the current user
            .single();

        if (addressError || !address) {
            console.error("Supabase error fetching delivery address:", addressError?.message);
            return res.status(404).json({ error: 'Delivery address not found or does not belong to your account.' });
        }

        // 3. Calculate Subtotal and Delivery Fee (server-side calculation is safer)
        // For production, you would fetch actual menu_item prices from DB here to prevent tampering.
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (isNaN(subtotal) || subtotal < 0) {
            return res.status(400).json({ error: 'Invalid item prices or quantities provided.' });
        }

        // Adjusted delivery fee logic based on city (example) or subtotal
        let deliveryFee = 0;
        // Example: Free delivery for Lagos orders >= N5000, otherwise N1000 for Lagos
        // Other cities might have a higher base fee
        if (address.city.toLowerCase() === 'lagos') {
            deliveryFee = subtotal >= 5000 ? 0 : 1000;
        } else {
            deliveryFee = 2000; // Example for non-Lagos cities
        }
        
        const totalAmount = subtotal + deliveryFee;

        // 4. Generate Order Number
        const orderNumber = generateOrderNumber(); // Make sure this utility is robust

        // 5. Insert into 'orders' table
        // IMPORTANT: Ensure the column names here EXACTLY match your 'orders' table schema.
        // 'address_id' in the payload is mapped to 'delivery_address_id' if that's your column name.
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
                user_id: userId,
                order_number: orderNumber,
                // Assuming your orders table has a column named 'delivery_address_id'
                delivery_address_id: address_id, // Use the validated address_id
                delivery_notes: delivery_notes || null, // Use null if empty
                subtotal: subtotal,
                delivery_fee: deliveryFee,
                total_amount: totalAmount,
                status: 'pending', // Initial status
                created_at: new Date().toISOString(), // Explicitly set if not default
                updated_at: new Date().toISOString()  // Initialize updated_at
            }])
            .select('*') // Select the newly created order record
            .single();

        if (orderError) {
            console.error('Supabase error creating main order record:', orderError.message);
            // Handle specific errors, e.g., foreign key violations
            if (orderError.code === '23503') {
                return res.status(400).json({ error: 'Invalid user or delivery address specified.' });
            }
            return res.status(500).json({ error: `Failed to create order: ${orderError.message}` });
        }
        if (!order) {
            return res.status(500).json({ error: 'Order creation failed: No order data returned after insert.' });
        }

        // 6. Prepare and Insert into 'order_items' table
        const orderItemsToInsert = items.map(item => ({
            order_id: order.id, // Link to the newly created order
            menu_item_id: item.id, // Assuming item.id from frontend is menu_item_id
            quantity: item.quantity,
            price_at_order: item.price, // Price at the moment of order
            special_instructions: item.special_instructions || null
        }));

        const { error: orderItemsError } = await supabase
            .from('order_items')
            .insert(orderItemsToInsert);

        if (orderItemsError) {
            console.error('Supabase error inserting order items:', orderItemsError.message);
            // CRITICAL: Rollback the parent order if order items fail to insert
            await supabase.from('orders').delete().eq('id', order.id);
            return res.status(500).json({ error: `Failed to add order items. Order has been cancelled: ${orderItemsError.message}` });
        }

        // 7. Respond with the created order
        res.status(201).json(order);

    } catch (error) {
        console.error('Unhandled error in createOrder:', error.message);
        res.status(500).json({ error: error.message || 'An unexpected error occurred during order creation.' });
    }
};

export const initiatePayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userEmail = req.user.email; // Email from authenticated user token

        // 1. Fetch order details to get total_amount and verify ownership/status
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (orderError) {
            console.error('Supabase error fetching order for payment initiation:', orderError.message);
            if (orderError.code === 'PGRST116') { // No rows found
                return res.status(404).json({ error: 'Order not found.' });
            }
            return res.status(500).json({ error: 'Database error fetching order for payment.' });
        }
        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        // 2. Authorization check
        if (order.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to initiate payment for this order.' });
        }

        // 3. Order status check
        if (order.status !== 'pending' && order.status !== 'payment_failed') { // Allow re-initiation if payment failed
            return res.status(400).json({ error: `Payment cannot be initiated for order in '${order.status}' status.` });
        }

        // 4. Initialize payment with Paystack
        // Paystack expects amount in Kobo/Cent
        const paymentAmountInKobo = order.total_amount * 100;
        const paymentDetails = await initializePayment(userEmail, paymentAmountInKobo, {
            order_id: order.id,
            order_number: order.order_number,
            full_name: req.user.full_name // Pass user's name if available
        });

        if (!paymentDetails || !paymentDetails.status || !paymentDetails.data || !paymentDetails.data.authorization_url || !paymentDetails.data.reference) {
            console.error('Paystack initialization failed:', paymentDetails);
            throw new Error('Failed to initialize payment with Paystack. Please try again.');
        }

        // 5. Update order with payment reference and status (e.g., 'payment_pending')
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                payment_reference: paymentDetails.data.reference,
                status: 'payment_pending', // Indicate payment process has started
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId);

        if (updateError) {
            console.error('Supabase error updating order payment reference:', updateError.message);
            // Don't throw error here as payment initiation might still be successful from Paystack's side
            // but log it and proceed. Reconciliation will catch discrepancies.
        }

        // 6. Respond with Paystack authorization URL
        res.status(200).json({ authorization_url: paymentDetails.data.authorization_url, reference: paymentDetails.data.reference });

    } catch (error) {
        console.error('Error in initiatePayment:', error.message);
        res.status(500).json({ error: error.message || 'An error occurred during payment initiation.' });
    }
};


// Webhook handler for Paystack (or other payment gateways)
export const handlePaymentWebhook = async (req, res) => {
    try {
        // 1. Verify webhook signature (CRUCIAL for security)
        // The verifyPayment function should handle this
        const event = req.body;
        const verificationResult = verifyPayment(event); // This function should verify integrity
        if (!verificationResult) {
            return res.status(400).json({ error: 'Webhook signature verification failed.' });
        }

        // Paystack sends 'event.data.status' and 'event.data.reference'
        const paystackReference = event.data.reference;
        const paystackStatus = event.data.status;
        const paystackAmount = event.data.amount / 100; // Convert kobo to actual amount

        console.log(`Webhook received: Reference=${paystackReference}, Status=${paystackStatus}, Amount=${paystackAmount}`);

        // Fetch the order using the payment reference
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*')
            .eq('payment_reference', paystackReference)
            .single();

        if (orderError || !order) {
            console.error('Order not found for payment reference:', paystackReference, orderError?.message);
            return res.status(404).json({ error: 'Order not found for this payment reference.' });
        }

        let newOrderStatus = order.status; // Default to current status
        let updatePayload = { updated_at: new Date().toISOString() };

        if (paystackStatus === 'success') {
            // Optional: Verify amounts match to prevent tampering
            if (paystackAmount !== order.total_amount) {
                console.warn(`Payment amount mismatch for order ${order.id}. Expected ${order.total_amount}, got ${paystackAmount}.`);
                // You might update status to 'payment_discrepancy' or require manual review
                newOrderStatus = 'payment_discrepancy';
                updatePayload.payment_status_note = `Amount mismatch: Expected ${order.total_amount}, received ${paystackAmount}.`;
            } else {
                newOrderStatus = 'processing'; // Or 'completed' if no further action needed
                updatePayload.payment_status_note = 'Payment successful.';
            }
            updatePayload.is_paid = true;
            updatePayload.paid_at = new Date().toISOString();

        } else if (paystackStatus === 'failed' || paystackStatus === 'abandoned') {
            newOrderStatus = 'payment_failed';
            updatePayload.payment_status_note = `Payment failed: ${paystackStatus}`;
            updatePayload.is_paid = false;
        } else if (paystackStatus === 'reversed') {
             newOrderStatus = 'payment_reversed';
             updatePayload.payment_status_note = `Payment reversed: ${paystackStatus}`;
             updatePayload.is_paid = false;
        }
        // Add more statuses as needed (e.g., 'refunded', 'charged_back')

        // Only update if status has actually changed or payment info is new
        if (newOrderStatus !== order.status || !order.is_paid) {
            const { error: updateOrderError } = await supabase
                .from('orders')
                .update({ ...updatePayload, status: newOrderStatus })
                .eq('id', order.id);

            if (updateOrderError) {
                console.error('Supabase error updating order status from webhook:', updateOrderError.message);
                // Depending on criticality, you might want to retry or alert here
            }
        }

        // Acknowledge receipt of the webhook
        res.status(200).send('Webhook received and processed.');

    } catch (error) {
        console.error('Error in handlePaymentWebhook:', error.message);
        res.status(500).json({ error: 'Internal server error processing webhook.' });
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
                user_addresses ( street_address, city, state, postal_code, country )
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
                    menu_items ( name, description, image_url )
                ),
                users ( full_name, email ),
                user_addresses ( street_address, city, state, postal_code, country )
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

        const validStatuses = ['pending', 'processing', 'shipped', 'completed', 'cancelled', 'payment_pending', 'payment_failed', 'payment_discrepancy', 'payment_reversed']; // Added payment statuses
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Valid order status is required.' });
        }

        const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update({ status: status, updated_at: new Date().toISOString() })
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

// You will also need a webhook route in your orderRoutes.js for handlePaymentWebhook
// Example: router.post('/webhook/paystack', handlePaymentWebhook);