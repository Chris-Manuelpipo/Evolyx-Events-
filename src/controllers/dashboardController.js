const { query } = require("../db");

/**
 * GET /api/dashboard
 * Stats globales de l'organisateur connecté
 */
const getDashboard = async (req, res, next) => {
  try {
    const organizerId = req.organizer.id;

    const [events, revenue, registrations, recentEvents] = await Promise.all([

      // Stats événements
      query(
        `SELECT
           COUNT(*)                                    AS total_events,
           COUNT(*) FILTER (WHERE status = 'PUBLISHED') AS active_events,
           COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_events,
           COUNT(*) FILTER (WHERE status = 'DRAFT')     AS draft_events
         FROM events WHERE organizer_id = $1`,
        [organizerId]
      ),

      // Stats revenus
      query(
        `SELECT
           COALESCE(SUM(r.amount_paid), 0) AS total_revenue,
           COALESCE(SUM(r.amount_paid) FILTER (
             WHERE r.created_at >= date_trunc('month', NOW())), 0) AS revenue_this_month,
           COALESCE(SUM(r.amount_paid) FILTER (
             WHERE r.created_at >= NOW() - INTERVAL '7 days'), 0)  AS revenue_this_week
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         WHERE e.organizer_id = $1
           AND r.status IN ('CONFIRMED','MANUAL')`,
        [organizerId]
      ),

      // Stats inscriptions
      query(
        `SELECT
           COUNT(*)                                           AS total_registrations,
           COUNT(*) FILTER (WHERE r.status = 'CONFIRMED')    AS confirmed,
           COUNT(*) FILTER (WHERE r.status = 'PENDING')      AS pending,
           COUNT(*) FILTER (WHERE r.status = 'MANUAL')       AS manual,
           COUNT(*) FILTER (WHERE r.checked_in = TRUE)       AS checked_in,
           COUNT(*) FILTER (WHERE r.created_at >= date_trunc('month', NOW())) AS this_month
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         WHERE e.organizer_id = $1`,
        [organizerId]
      ),

      // 5 événements récents
      query(
        `SELECT e.id, e.title, e.slug, e.status,
                e.start_date, e.city,
                COUNT(r.id) FILTER (
                  WHERE r.status IN ('CONFIRMED','MANUAL')) AS registrations_count,
                COALESCE(SUM(r.amount_paid) FILTER (
                  WHERE r.status IN ('CONFIRMED','MANUAL')), 0) AS revenue
         FROM events e
         LEFT JOIN registrations r ON r.event_id = e.id
         WHERE e.organizer_id = $1
         GROUP BY e.id
         ORDER BY e.created_at DESC
         LIMIT 5`,
        [organizerId]
      ),
    ]);

    res.json({
      success: true,
      data: {
        organizer:    req.organizer,
        events:       events.rows[0],
        revenue:      revenue.rows[0],
        registrations: registrations.rows[0],
        recent_events: recentEvents.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/dashboard/activity
 * Activité des 30 derniers jours
 */
const getActivity = async (req, res, next) => {
  try {
    const organizerId = req.organizer.id;

    const [dailyRegistrations, dailyRevenue] = await Promise.all([

      // Inscriptions par jour sur 30 jours
      query(
        `SELECT
           DATE(r.created_at) AS date,
           COUNT(*)            AS registrations,
           COUNT(*) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')) AS confirmed
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         WHERE e.organizer_id = $1
           AND r.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(r.created_at)
         ORDER BY date ASC`,
        [organizerId]
      ),

      // Revenus par jour sur 30 jours
      query(
        `SELECT
           DATE(r.created_at)          AS date,
           COALESCE(SUM(r.amount_paid), 0) AS revenue
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         WHERE e.organizer_id = $1
           AND r.status IN ('CONFIRMED','MANUAL')
           AND r.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(r.created_at)
         ORDER BY date ASC`,
        [organizerId]
      ),
    ]);

    res.json({
      success: true,
      data: {
        daily_registrations: dailyRegistrations.rows,
        daily_revenue:       dailyRevenue.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboard, getActivity };