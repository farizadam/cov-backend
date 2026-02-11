const express = require("express");
const walletController = require("../controllers/walletController");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get wallet balance and summary
router.get("/", walletController.getWallet);

// Get transaction history
router.get("/transactions", walletController.getTransactions);

// Get payout/withdrawal history
router.get("/payouts", walletController.getPayouts);

// Get earnings summary (monthly stats, etc.)
router.get("/earnings-summary", walletController.getEarningsSummary);

// Calculate potential earnings (preview)
router.get("/calculate-earnings", walletController.calculateEarnings);

// Request a withdrawal
router.post("/withdraw", walletController.requestWithdrawal);

// Connect bank account (Stripe Connect)
router.post("/connect-bank", walletController.connectBankAccount);

// Get bank account connection status
router.get("/bank-status", walletController.getBankStatus);

module.exports = router;
