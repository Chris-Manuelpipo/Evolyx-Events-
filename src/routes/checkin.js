const router         = require("express").Router();
const authMiddleware = require("../middlewares/auth");
const {
  scanTicket,
  getCheckinStats,
  getOfflineList,
} = require("../controllers/checkinController");

// Scan public (l'agent de sécurité n'a pas forcément un compte)
router.post("/scan", scanTicket);

// Routes protégées organisateur
router.get("/:eventId/stats", authMiddleware, getCheckinStats);
router.get("/:eventId/list",  authMiddleware, getOfflineList);

module.exports = router;