const jwt    = require("jsonwebtoken");
const config = require("../config");
const { query } = require("../db");

/**
 * Middleware d'authentification JWT
 * Vérifie le token et attache l'organisateur à req.organizer
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 1. Vérifier la présence du header Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error:   "Token d'authentification manquant",
      });
    }

    // 2. Extraire et vérifier le token
    const token   = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    // 3. Vérifier que l'organisateur existe toujours en DB
    const result = await query(
      `SELECT id, email, name, phone, org_name, org_slug,
              currency, timezone, country
       FROM organizers
       WHERE id = $1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error:   "Compte introuvable",
      });
    }

    // 4. Attacher l'organisateur à la requête
    req.organizer = result.rows[0];
    next();

  } catch (err) {
    next(err);
  }
};

module.exports = authMiddleware;