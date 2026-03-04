const { query } = require("../db");

/**
 * GET /api/events/:eventId/tickets
 * Liste des types de billets d'un événement
 */
const getTicketTypes = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Vérifier la propriété de l'événement
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
           WHEN quantity IS NULL THEN TRUE
           WHEN quantity - sold > 0 THEN TRUE
           ELSE FALSE
         END AS is_available,
         CASE
           WHEN quantity IS NULL THEN NULL
           ELSE quantity - sold
         END AS remaining
       FROM ticket_types
       WHERE event_id = $1
       ORDER BY sort_order ASC`,
      [eventId]
    );

    res.json({
      success: true,
      data:    { ticket_types: result.rows },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/events/:eventId/tickets
 * Créer un type de billet
 */
const createTicketType = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const {
      name, description, price,
      currency, quantity,
      sale_start, sale_end,
    } = req.body;

    // Vérifier la propriété de l'événement
    const eventCheck = await query(
      "SELECT id, status FROM events WHERE id = $1 AND organizer_id = $2",
      [eventId, req.organizer.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    // Calculer le sort_order automatiquement
    const orderResult = await query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM ticket_types WHERE event_id = $1`,
      [eventId]
    );

    const result = await query(
      `INSERT INTO ticket_types
         (event_id, name, description, price, currency,
          quantity, sale_start, sale_end, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        eventId,
        name.trim(),
        description  || null,
        price        || 0,
        currency     || req.organizer.currency,
        quantity     || null,
        sale_start   || null,
        sale_end     || null,
        orderResult.rows[0].next_order,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Type de billet créé",
      data:    { ticket_type: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/events/:eventId/tickets/:id
 * Modifier un type de billet
 */
const updateTicketType = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;
    const {
      name, description, price,
      currency, quantity,
      sale_start, sale_end, is_active,
    } = req.body;

    // Vérifier la propriété
    const check = await query(
      `SELECT tt.id FROM ticket_types tt
       JOIN events e ON e.id = tt.event_id
       WHERE tt.id = $1 AND tt.event_id = $2 AND e.organizer_id = $3`,
      [id, eventId, req.organizer.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Type de billet introuvable",
      });
    }

    const result = await query(
      `UPDATE ticket_types SET
         name        = COALESCE($1, name),
         description = COALESCE($2, description),
         price       = COALESCE($3, price),
         currency    = COALESCE($4, currency),
         quantity    = COALESCE($5, quantity),
         sale_start  = COALESCE($6, sale_start),
         sale_end    = COALESCE($7, sale_end),
         is_active   = COALESCE($8, is_active),
         updated_at  = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        name, description, price,
        currency, quantity,
        sale_start, sale_end,
        is_active, id,
      ]
    );

    res.json({
      success: true,
      message: "Type de billet mis à jour",
      data:    { ticket_type: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/events/:eventId/tickets/:id
 * Supprimer un type de billet
 */
const deleteTicketType = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;

    const check = await query(
      `SELECT tt.id, tt.sold FROM ticket_types tt
       JOIN events e ON e.id = tt.event_id
       WHERE tt.id = $1 AND tt.event_id = $2 AND e.organizer_id = $3`,
      [id, eventId, req.organizer.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Type de billet introuvable",
      });
    }

    if (check.rows[0].sold > 0) {
      return res.status(400).json({
        success: false,
        error:   "Impossible de supprimer un billet avec des ventes existantes",
      });
    }

    await query("DELETE FROM ticket_types WHERE id = $1", [id]);

    res.json({
      success: true,
      message: "Type de billet supprimé",
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
};