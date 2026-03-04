const router         = require("express").Router({ mergeParams: true });
const authMiddleware = require("../middlewares/auth");
const {
  getRegistrations,
  createRegistration,
  getRegistration,
  confirmRegistration,
  cancelRegistration,
  exportRegistrations,
} = require("../controllers/registrationsController");

// ── Route publique (inscription participant) ─────
router.post("/", createRegistration);

// ── Routes protégées (organisateur) ─────────────
router.get  ("/export",        authMiddleware, exportRegistrations);
router.get  ("/",              authMiddleware, getRegistrations);
router.get  ("/:id",           authMiddleware, getRegistration);
router.patch("/:id/confirm",   authMiddleware, confirmRegistration);
router.patch("/:id/cancel",    authMiddleware, cancelRegistration);

module.exports = router;