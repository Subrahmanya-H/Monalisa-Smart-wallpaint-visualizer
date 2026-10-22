const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error('MONGO_URI must start with mongodb:// or mongodb+srv://');
  }

  await mongoose.connect(uri, {
    dbName: 'monalisa_paints',
  });

  console.log('MongoDB connected to monalisa_paints');
}

module.exports = connectDB;
