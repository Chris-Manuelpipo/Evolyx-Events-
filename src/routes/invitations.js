// src/routes/invitations.js
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { acceptInvitation } = require('../controllers/membersController');

// Accepter une invitation (l'utilisateur doit être connecté)
router.post('/accept/:token', auth, acceptInvitation);

module.exports = router;