const { query } = require("../db");

/**
 * GET /api/events/:eventId/promos
 * Liste des codes promo d'un événement
 */
const getPromoCodes = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const eventCheck = await query(
      "SELECT id FROM events WHERE id = $1 AND organizer_id = $2",
      [eventId, req.organizer.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    const result = await query(
      `SELECT *,
         CASE
           WHEN max_uses IS NULL THEN TRUE
           WHEN used_count < max_uses THEN TRUE
           ELSE FALSE
         END AS is_usable
       FROM promo_codes
       WHERE event_id = $1
       ORDER BY created_at DESC`,
      [eventId]
    );

    res.json({
      success: true,
      data:    { promo_codes: result.rows },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/events/:eventId/promos
 * Créer un code promo
 */
const createPromoCode = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const {
      code, discount_type,
      discount_value, max_uses, expires_at,
    } = req.body;

    const eventCheck = await query(
      "SELECT id FROM events WHERE id = $1 AND organizer_id = $2",
      [eventId, req.organizer.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    const result = await query(
      `INSERT INTO promo_codes
         (event_id, code, discount_type, discount_value, max_uses, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        eventId,
        code.trim().toUpperCase(),
        discount_type,
        discount_value,
        max_uses   || null,
        expires_at || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Code promo créé",
      data:    { promo_code: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/events/:eventId/promos/verify
 * Vérifier un code promo avant inscription
 */
const verifyPromoCode = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { code, ticket_type_id } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error:   "Code promo requis",
      });
    }

    const promoResult = await query(
      `SELECT * FROM promo_codes
       WHERE event_id = $1
         AND code = $2
         AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR used_count < max_uses)`,
      [eventId, code.trim().toUpperCase()]
    );

    if (promoResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error:   "Code promo invalide ou expiré",
      });
    }

    const promo = promoResult.rows[0];

    // Calculer la réduction sur le prix du billet
    let discount_amount = 0;
    if (ticket_type_id) {
      const ticketResult = await query(
        "SELECT price, currency FROM ticket_types WHERE id = $1",
        [ticket_type_id]
      );

      if (ticketResult.rows.length > 0) {
        const { price } = ticketResult.rows[0];
        if (promo.discount_type === "PERCENTAGE") {
          discount_amount = (price * promo.discount_value) / 100;
        } else {
          discount_amount = Math.min(promo.discount_value, price);
        }
      }
    }

    res.json({
      success: true,
      message: "Code promo valide",
      data: {
        promo_code:      promo,
        discount_amount: parseFloat(discount_amount.toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/events/:eventId/promos/:id/toggle
 * Activer ou désactiver un code promo
 */
const togglePromoCode = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;

    const check = await query(
      `SELECT p.id, p.is_active FROM promo_codes p
       JOIN events e ON e.id = p.event_id
       WHERE p.id = $1 AND p.event_id = $2 AND e.organizer_id = $3`,
      [id, eventId, req.organizer.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Code promo introuvable",
      });
    }

    const newStatus = !check.rows[0].is_active;

    const result = await query(
      `UPDATE promo_codes SET is_active = $1
       WHERE id = $2 RETURNING *`,
      [newStatus, id]
    );

    res.json({
      success: true,
      message: `Code promo ${newStatus ? "activé" : "désactivé"}`,
      data:    { promo_code: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/events/:eventId/promos/:id
 * Supprimer un code promo
 */
const deletePromoCode = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;

    const check = await query(
      `SELECT p.id, p.used_count FROM promo_codes p
       JOIN events e ON e.id = p.event_id
       WHERE p.id = $1 AND p.event_id = $2 AND e.organizer_id = $3`,
      [id, eventId, req.organizer.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Code promo introuvable",
      });
    }

    if (check.rows[0].used_count > 0) {
      return res.status(400).json({
        success: false,
        error:   "Impossible de supprimer un code promo déjà utilisé",
      });
    }

    await query("DELETE FROM promo_codes WHERE id = $1", [id]);

    res.json({
      success: true,
      message: "Code promo supprimé",
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPromoCodes,
  createPromoCode,
  verifyPromoCode,
  togglePromoCode,
  deletePromoCode,
};