// src/routes/payments.js
const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  initiate,
  webhook,
  verify,
  getStatus,
  getHistory,
} = require('../controllers/paymentsController');

// ⚠️  Webhook CinetPay — PUBLIQUE, pas d'auth
// CinetPay appelle cette URL après chaque paiement
router.post('/cinetpay/webhook', webhook);

// Initier un paiement (depuis le front public — pas besoin d'être connecté)
router.post('/cinetpay/initiate', initiate);

// Vérification manuelle d'une transaction (polling front)
router.get('/cinetpay/verify/:transactionId', verify);

// Statut paiement par registrationId (front polle après retour CinetPay)
router.get('/status/:registrationId', getStatus);

// Historique transactions organisateur (protégé)
router.get('/history', auth, getHistory);

module.exports = router;