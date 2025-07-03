import supabase from '../config/supabase.js';
import { initializePayment, verifyPayment } from '../config/paystack.js';
import { generateOrderNumber } from '../utils/generateOrderNumber.js';

export const createOrder = async (req, res) => {
  try {
    const { user_id, items, delivery_address, delivery_notes } = req.body;
    
    // Calculate total
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = subtotal > 5000 ? 0 : 1000; // Free delivery for orders over ₦5000
    const total = subtotal + deliveryFee;

    // Create order
    const orderNumber = generateOrderNumber();
    const { data: order, error } = await supabase
      .from('orders')
      .insert([{
        user_id,
        order_number: orderNumber,
        delivery_address,
        delivery_notes,
        subtotal,
        delivery_fee: deliveryFee,
        total_amount: total,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;

    // Add order items
    const orderItems = items.map(item => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: item.quantity,
      price_at_order: item.price
    }));

    await supabase.from('order_items').insert(orderItems);

    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const initiatePayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { email } = req.user;

    // Get order
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) throw error;

    // Initialize payment
    const payment = await initializePayment(email, order.total_amount, {
      order_id: orderId,
      order_number: order.order_number
    });

    // Update order with payment reference
    await supabase
      .from('orders')
      .update({ payment_reference: payment.data.reference })
      .eq('id', orderId);

    res.json({ authorization_url: payment.data.authorization_url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};