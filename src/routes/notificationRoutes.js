const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const { safeGet, safeSetex, safeDel } = require("../config/redisClient");

// Get all notifications for the logged-in user
router.get("/", auth, async (req, res) => {
  try {
    const cacheKey = `notifications:${req.user.id}`;

    // Try cache first (safe – returns null when Redis is down)
    const cached = await safeGet(cacheKey);
    if (cached) {
      console.log("[CACHE HIT] notifications");
      return res.json(JSON.parse(cached));
    }

    const notifications = await Notification.find({ user_id: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);

    const response = { notifications };

    // Cache for 1 minute (safe – no-op when Redis is down)
    await safeSetex(cacheKey, 60, JSON.stringify(response));

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// Mark a notification as read
router.patch("/:id/read", auth, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.id },
      { is_read: true },
      { new: true },
    );
    if (!notif)
      return res.status(404).json({ message: "Notification not found" });

    // Invalidate cache when notification is updated
    await safeDel(`notifications:${req.user.id}`);

    res.json({ notification: notif });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notification" });
  }
});

module.exports = router;
