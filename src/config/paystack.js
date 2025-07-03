import axios from 'axios';
import 'dotenv/config';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

export const initializePayment = async (email, amount, metadata) => {
  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: amount * 100, // Convert to kobo
        metadata
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Paystack error: ${error.response?.data?.message || error.message}`);
  }
};

export const verifyPayment = async (reference) => {
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
        }
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Paystack verification error: ${error.response?.data?.message || error.message}`);
  }
};