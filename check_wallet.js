const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');
const Wallet = require('./src/models/Wallet');

async function checkWallet() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const user = await User.findOne({ email: 'demo@gmail.com' });
    if (!user) {
      console.log('User not found');
      process.exit(1);
    }
    
    console.log('User ID:', user._id);
    
    const wallet = await Wallet.findOne({ user_id: user._id });
    if (!wallet) {
      console.log('No wallet found');
    } else {
      console.log(`Wallet balance: ${wallet.balance} cents (${wallet.balance/100} EUR)`);
      console.log(`Total earned: ${wallet.total_earned} cents`);
      console.log(`Last updated: ${wallet.updatedAt}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkWallet();
