const mongoose = require('mongoose');
require('dotenv').config();

const Transaction = require('./src/models/Transaction');
const User = require('./src/models/User');

async function checkTransactions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find the user by email
    const user = await User.findOne({ email: 'demo@gmail.com' });
    if (!user) {
      console.log('User not found');
      process.exit(1);
    }
    
    console.log('User ID:', user._id);
    
    // Get recent transactions for this user
    const transactions = await Transaction.find({ user_id: user._id })
      .sort({ createdAt: -1 })
      .limit(10);
      
    console.log('Recent transactions:');
    transactions.forEach(t => {
      console.log(`- ${t.type}: ${t.amount} cents (${t.description}) - ${t.createdAt}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTransactions();
