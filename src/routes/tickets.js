const router         = require("express").Router({ mergeParams: true });
const authMiddleware = require("../middlewares/auth");
const { validateCreateTicket, validateCreatePromo } = require("../validators/tickets");
const {
  getTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
} = require("../controllers/ticketsController");
const {
  getPromoCodes,
  createPromoCode,
  verifyPromoCode,
  togglePromoCode,
  deletePromoCode,
} = require("../controllers/promoController");

// ── Types de billets ─────────────────────────────
router.get   ("/",           authMiddleware, getTicketTypes);
router.post  ("/",           authMiddleware, validateCreateTicket, createTicketType);
router.put   ("/:id",        authMiddleware, updateTicketType);
router.delete("/:id",        authMiddleware, deleteTicketType);

// ── Codes promo ──────────────────────────────────
router.get   ("/promos",          authMiddleware, getPromoCodes);
router.post  ("/promos",          authMiddleware, validateCreatePromo, createPromoCode);
router.post  ("/promos/verify",   verifyPromoCode);
router.patch ("/promos/:id/toggle", authMiddleware, togglePromoCode);
router.delete("/promos/:id",      authMiddleware, deletePromoCode);

module.exports = router;