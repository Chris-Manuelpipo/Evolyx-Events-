/**
 * Middleware gestion globale des erreurs
 * Doit être le DERNIER middleware dans Express
 */
const errorHandler = (err, req, res, next) => {
  console.error(`❌ [${req.method}] ${req.path} :`, err.message);

  // Violation contrainte unique PostgreSQL
  if (err.code === "23505") {
    return res.status(409).json({
      success: false,
      error:   "Cette valeur existe déjà",
    });
  }

  // Violation clé étrangère PostgreSQL
  if (err.code === "23503") {
    return res.status(400).json({
      success: false,
      error:   "Référence invalide",
    });
  }

  // Erreur JWT
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      error:   "Token invalide",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      error:   "Token expiré, veuillez vous reconnecter",
    });
  }

  // Erreur avec status défini manuellement
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Erreur interne du serveur"
        : err.message,
  });
};

/**
 * Middleware routes introuvables (404)
 */
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error:   `Route ${req.method} ${req.path} introuvable`,
  });
};

module.exports = { errorHandler, notFound };