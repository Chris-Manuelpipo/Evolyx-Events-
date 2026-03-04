const { query } = require("../db");
const { generateSlug, generateUniqueId } = require("../utils");

/**
 * GET /api/events
 * Liste des événements de l'organisateur connecté
 */
const getEvents = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.organizer.id];
    let whereClause = "WHERE e.organizer_id = $1";

    if (status) {
      params.push(status.toUpperCase());
      whereClause += ` AND e.status = $${params.length}`;
    }

    const eventsResult = await query(
      `SELECT e.*,
         COUNT(r.id) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')) AS registrations_count,
         COALESCE(SUM(r.amount_paid) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')), 0) AS total_revenue
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id
       ${whereClause}
       GROUP BY e.id
       ORDER BY e.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM events e ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        events: eventsResult.rows,
        pagination: {
          total,
          page:  parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/events/:id
 * Détail d'un événement avec ses types de billets
 */
const getEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const eventResult = await query(
      `SELECT e.*,
         COUNT(r.id) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')) AS registrations_count,
         COALESCE(SUM(r.amount_paid) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')), 0) AS total_revenue,
         COUNT(r.id) FILTER (WHERE r.checked_in = TRUE) AS checked_in_count
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id
       WHERE e.id = $1 AND e.organizer_id = $2
       GROUP BY e.id`,
      [id, req.organizer.id]
    );

    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    const ticketsResult = await query(
      `SELECT * FROM ticket_types
       WHERE event_id = $1
       ORDER BY sort_order ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        event:        eventResult.rows[0],
        ticket_types: ticketsResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/events
 * Créer un événement
 */
const createEvent = async (req, res, next) => {
  try {
    const {
      title, description, cover_url,
      location_type, address, district,
      city, country, online_url,
      start_date, end_date, timezone,
      capacity,
    } = req.body;

    const slug = `${generateSlug(title)}-${generateUniqueId(6)}`;

    const result = await query(
      `INSERT INTO events
         (organizer_id, title, slug, description, cover_url,
          location_type, address, district, city, country, online_url,
          start_date, end_date, timezone, capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        req.organizer.id, title.trim(), slug,
        description  || null,
        cover_url    || null,
        location_type || "PHYSICAL",
        address      || null,
        district     || null,
        city         || null,
        country      || "CM",
        online_url   || null,
        start_date, end_date,
        timezone     || "Africa/Douala",
        capacity     || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Événement créé",
      data:    { event: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/events/:id
 * Modifier un événement
 */
const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title, description, cover_url,
      location_type, address, district,
      city, country, online_url,
      start_date, end_date, timezone,
      capacity, status,
    } = req.body;

    const check = await query(
      "SELECT id FROM events WHERE id = $1 AND organizer_id = $2",
      [id, req.organizer.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    const result = await query(
      `UPDATE events SET
         title         = COALESCE($1,  title),
         description   = COALESCE($2,  description),
         cover_url     = COALESCE($3,  cover_url),
         location_type = COALESCE($4,  location_type),
         address       = COALESCE($5,  address),
         district      = COALESCE($6,  district),
         city          = COALESCE($7,  city),
         country       = COALESCE($8,  country),
         online_url    = COALESCE($9,  online_url),
         start_date    = COALESCE($10, start_date),
         end_date      = COALESCE($11, end_date),
         timezone      = COALESCE($12, timezone),
         capacity      = COALESCE($13, capacity),
         status        = COALESCE($14, status),
         updated_at    = NOW()
       WHERE id = $15 AND organizer_id = $16
       RETURNING *`,
      [
        title, description, cover_url,
        location_type, address, district,
        city, country, online_url,
        start_date, end_date, timezone,
        capacity, status,
        id, req.organizer.id,
      ]
    );

    res.json({
      success: true,
      message: "Événement mis à jour",
      data:    { event: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/events/:id
 * Supprimer un événement (seulement si DRAFT)
 */
const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await query(
      "SELECT id, status FROM events WHERE id = $1 AND organizer_id = $2",
      [id, req.organizer.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    if (check.rows[0].status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        error:   "Seul un événement en brouillon peut être supprimé",
      });
    }

    await query("DELETE FROM events WHERE id = $1", [id]);

    res.json({
      success: true,
      message: "Événement supprimé",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/events/:id/publish
 * Publier un événement
 */
const publishEvent = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Vérifier qu'il y a au moins un type de billet actif
    const tickets = await query(
      "SELECT id FROM ticket_types WHERE event_id = $1 AND is_active = TRUE",
      [id]
    );

    if (tickets.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error:   "Ajoutez au moins un type de billet avant de publier",
      });
    }

    const result = await query(
      `UPDATE events
       SET status = 'PUBLISHED', updated_at = NOW()
       WHERE id = $1 AND organizer_id = $2
       RETURNING *`,
      [id, req.organizer.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    res.json({
      success: true,
      message: "Événement publié",
      data:    { event: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/events/:id/stats
 * Statistiques d'un événement
 */
const getEventStats = async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await query(
      "SELECT id FROM events WHERE id = $1 AND organizer_id = $2",
      [id, req.organizer.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    const [summary, byType, byDay] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('CONFIRMED','MANUAL'))  AS total_confirmed,
           COUNT(*) FILTER (WHERE checked_in = TRUE)                 AS total_checked_in,
           COUNT(*) FILTER (WHERE status = 'PENDING')                AS total_pending,
           COALESCE(SUM(amount_paid) FILTER (
             WHERE status IN ('CONFIRMED','MANUAL')), 0)             AS total_revenue,
           COUNT(*) FILTER (WHERE payment_method = 'CINETPAY')       AS mobile_money_count,
           COUNT(*) FILTER (WHERE payment_method = 'STRIPE')         AS card_count,
           COUNT(*) FILTER (WHERE payment_method = 'MANUAL')         AS manual_count,
           COUNT(*) FILTER (WHERE payment_method = 'FREE')           AS free_count
         FROM registrations WHERE event_id = $1`,
        [id]
      ),
      query(
        `SELECT tt.name, tt.price, tt.currency,
           COUNT(r.id) FILTER (
             WHERE r.status IN ('CONFIRMED','MANUAL'))               AS sold,
           COALESCE(SUM(r.amount_paid) FILTER (
             WHERE r.status IN ('CONFIRMED','MANUAL')), 0)           AS revenue
         FROM ticket_types tt
         LEFT JOIN registrations r ON r.ticket_type_id = tt.id
         WHERE tt.event_id = $1
         GROUP BY tt.id, tt.name, tt.price, tt.currency, tt.sort_order
         ORDER BY tt.sort_order`,
        [id]
      ),
      query(
        `SELECT DATE(created_at) AS date, COUNT(*) AS count
         FROM registrations
         WHERE event_id = $1 AND status IN ('CONFIRMED','MANUAL')
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        summary:              summary.rows[0],
        by_ticket_type:       byType.rows,
        registrations_by_day: byDay.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  getEventStats,
};