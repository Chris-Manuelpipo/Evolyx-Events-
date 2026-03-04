// src/routes/public.js
const express = require('express');
const router = express.Router();

const { verifyPromoCode } = require('../controllers/promoController');
router.post('/events/:slug/verify-promo', async (req, res, next) => {
  // Récupère l'event_id depuis le slug
  const { query } = require('../db');
  const ev = await query(`SELECT id FROM events WHERE slug = $1`, [req.params.slug]);
  if (!ev.rows.length) return res.status(404).json({ success:false, error:'Événement introuvable' });
  req.params.eventId = ev.rows[0].id;
  verifyPromoCode(req, res, next);
});

const {
  getPublicEvents,
  getPublicEvent,
  registerPublic,
  getConfirmation,
  getPublicOrganizer,
  getCities,
} = require('../controllers/publicController');

// Toutes ces routes sont 100% publiques — pas d'authMiddleware

// Marketplace / Recherche
router.get('/events', getPublicEvents);                         // GET /public/events?q=&city=&page=
router.get('/events/:slug', getPublicEvent);                   // GET /public/events/mon-gala-2025
router.post('/events/:slug/register', registerPublic);         // POST /public/events/mon-gala-2025/register
router.get('/confirm/:ticketCode', getConfirmation);           // GET /public/confirm/EVX-XXXXXXXXXX
router.get('/organizers/:orgSlug', getPublicOrganizer);        // GET /public/organizers/evolyx-events
router.get('/cities', getCities);                              // GET /public/cities

module.exports = router;