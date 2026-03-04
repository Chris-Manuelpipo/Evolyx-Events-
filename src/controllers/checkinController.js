const { query } = require("../db");

/**
 * POST /api/checkin/scan
 * Scanner un QR code et valider l'entrée
 */
const scanTicket = async (req, res, next) => {
  try {
    const { ticket_code, event_id } = req.body;

    if (!ticket_code || !event_id) {
      return res.status(400).json({
        success: false,
        error:   "ticket_code et event_id sont requis",
      });
    }

    // Chercher l'inscription
    const result = await query(
      `SELECT r.*,
              tt.name     AS ticket_type_name,
              e.title     AS event_title,
              e.start_date, e.end_date
       FROM registrations r
       JOIN ticket_types tt ON tt.id = r.ticket_type_id
       JOIN events e        ON e.id  = r.event_id
       WHERE r.ticket_code = $1 AND r.event_id = $2`,
      [ticket_code.trim().toUpperCase(), event_id]
    );

    // Billet introuvable
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        status:  "NOT_FOUND",
        message: "Billet introuvable",
      });
    }

    const registration = result.rows[0];

    // Billet annulé ou remboursé
    if (["CANCELLED", "REFUNDED"].includes(registration.status)) {
      return res.status(400).json({
        success: false,
        status:  "INVALID",
        message: "Billet annulé ou remboursé",
        data:    { registration },
      });
    }

    // Billet en attente de paiement
    if (registration.status === "PENDING") {
      return res.status(400).json({
        success: false,
        status:  "PENDING",
        message: "Paiement non confirmé",
        data:    { registration },
      });
    }

    // Billet déjà scanné
    if (registration.checked_in) {
      return res.status(400).json({
        success: false,
        status:  "ALREADY_CHECKED_IN",
        message: `Billet déjà utilisé à ${new Date(registration.checked_in_at).toLocaleTimeString("fr-FR")}`,
        data:    { registration },
      });
    }

    // ✅ Valider l'entrée
    const updated = await query(
      `UPDATE registrations SET
         checked_in    = TRUE,
         checked_in_at = NOW(),
         updated_at    = NOW()
       WHERE id = $1
       RETURNING *`,
      [registration.id]
    );

    res.json({
      success: true,
      status:  "VALID",
      message: "Entrée validée",
      data: {
        registration: {
          ...updated.rows[0],
          ticket_type_name: registration.ticket_type_name,
          event_title:      registration.event_title,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/checkin/:eventId/stats
 * Statistiques d'entrée en temps réel
 */
const getCheckinStats = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Vérifier la propriété
    const eventCheck = await query(
      "SELECT id, title, capacity FROM events WHERE id = $1 AND organizer_id = $2",
      [eventId, req.organizer.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    const event = eventCheck.rows[0];

    const [global, byType, recent] = await Promise.all([
      // Stats globales
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('CONFIRMED','MANUAL','FREE')) AS total_confirmed,
           COUNT(*) FILTER (WHERE checked_in = TRUE)                       AS total_checked_in,
           COUNT(*) FILTER (WHERE checked_in = FALSE
             AND status IN ('CONFIRMED','MANUAL'))                         AS total_not_checked_in
         FROM registrations WHERE event_id = $1`,
        [eventId]
      ),
      // Stats par type de billet
      query(
        `SELECT tt.name,
           COUNT(r.id) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')) AS confirmed,
           COUNT(r.id) FILTER (WHERE r.checked_in = TRUE)                AS checked_in
         FROM ticket_types tt
         LEFT JOIN registrations r ON r.ticket_type_id = tt.id
         WHERE tt.event_id = $1
         GROUP BY tt.id, tt.name, tt.sort_order
         ORDER BY tt.sort_order`,
        [eventId]
      ),
      // 10 dernières entrées
      query(
        `SELECT r.first_name, r.last_name, r.ticket_code,
                tt.name AS ticket_type, r.checked_in_at
         FROM registrations r
         JOIN ticket_types tt ON tt.id = r.ticket_type_id
         WHERE r.event_id = $1 AND r.checked_in = TRUE
         ORDER BY r.checked_in_at DESC
         LIMIT 10`,
        [eventId]
      ),
    ]);

    const stats = global.rows[0];
    const total     = parseInt(stats.total_confirmed);
    const checkedIn = parseInt(stats.total_checked_in);

    res.json({
      success: true,
      data: {
        event: {
          title:    event.title,
          capacity: event.capacity,
        },
        summary: {
          total_confirmed:     total,
          total_checked_in:    checkedIn,
          total_not_checked_in: parseInt(stats.total_not_checked_in),
          presence_rate:       total > 0
            ? `${Math.round((checkedIn / total) * 100)}%`
            : "0%",
        },
        by_ticket_type: byType.rows,
        recent_entries: recent.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/checkin/:eventId/list
 * Liste complète pour mode offline
 */
const getOfflineList = async (req, res, next) => {
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
      `SELECT r.ticket_code, r.first_name, r.last_name,
              r.checked_in, tt.name AS ticket_type
       FROM registrations r
       JOIN ticket_types tt ON tt.id = r.ticket_type_id
       WHERE r.event_id = $1
         AND r.status IN ('CONFIRMED','MANUAL')
       ORDER BY r.last_name ASC`,
      [eventId]
    );

    res.json({
      success: true,
      data: {
        tickets:      result.rows,
        total:        result.rows.length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { scanTicket, getCheckinStats, getOfflineList };