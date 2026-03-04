const router          = require("express").Router();
const authMiddleware  = require("../middlewares/auth");
const { validateCreateEvent, validateUpdateEvent } = require("../validators/events");
const {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  getEventStats,
} = require("../controllers/eventsController");

// Routes sans paramètre d'abord
router.get  ("/",             authMiddleware, getEvents);
router.post ("/",             authMiddleware, validateCreateEvent, createEvent);

// Routes avec sous-chemins AVANT /:id
router.post ("/:id/publish",  authMiddleware, publishEvent);
router.get  ("/:id/stats",    authMiddleware, getEventStats);

// Routes avec /:id en dernier
router.get  ("/:id",          authMiddleware, getEvent);
router.put  ("/:id",          authMiddleware, validateUpdateEvent, updateEvent);
router.delete("/:id",         authMiddleware, deleteEvent);

module.exports = router;