import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and Key must be provided in .env file');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;