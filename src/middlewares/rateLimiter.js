const rateLimit = require("express-rate-limit");

/**
 * Limiteur global — toutes les routes
 * 100 requêtes par IP toutes les 15 minutes
 */
const globalLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              100,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    error:   "Trop de requêtes, veuillez réessayer dans 15 minutes",
  },
});

/**
 * Limiteur strict — routes auth
 * 10 tentatives par IP toutes les 15 minutes
 */
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    error:   "Trop de tentatives, veuillez réessayer dans 15 minutes",
  },
});

/**
 * Limiteur inscription — route publique
 * 20 inscriptions par IP toutes les heures
 */
const registrationLimiter = rateLimit({
  windowMs:         60 * 60 * 1000,
  max:              20,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    error:   "Trop d'inscriptions depuis cette adresse IP",
  },
});

module.exports = { globalLimiter, authLimiter, registrationLimiter };