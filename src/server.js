// backend/src/server.js
import dotenv from 'dotenv';
dotenv.config(); 

import app from './App.js';
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Supabase URL status: ${process.env.SUPABASE_URL ? 'Loaded' : 'NOT LOADED'}`);
});