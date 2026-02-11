const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const authenticate = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// Get all conversations for current user
router.get("/conversations", chatController.getConversations);

// Get unread message count
router.get("/unread/count", chatController.getUnreadCount);

// Get chat info (other user details, ride info)
router.get("/:bookingId/info", chatController.getChatInfo);

// Get messages for a booking
router.get("/:bookingId", chatController.getMessages);

// Send a message
router.post("/:bookingId", chatController.sendMessage);

// Request-based chat endpoints
router.get("/request/:requestId/info", chatController.getRequestChatInfo);
router.get("/request/:requestId", chatController.getRequestMessages);
router.post("/request/:requestId", chatController.sendRequestMessage);

module.exports = router;
