// src/controllers/publicController.js
const { query } = require('../db');
const { generateTicketCode } = require('../utils');

// ─── GET /public/events ───────────────────────────────────────────
// Liste tous les événements publiés avec recherche + filtres
async function getPublicEvents(req, res, next) {
  try {
    const {
      q = '',           // recherche texte
      city = '',        // filtre ville
      category = '',    // filtre catégorie (futur)
      page = 1,
      limit = 12,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let idx = 1;
    let where = `WHERE e.status = 'PUBLISHED' AND e.end_date > NOW()`;

    if (q) {
      where += ` AND (e.title ILIKE $${idx} OR e.description ILIKE $${idx} OR e.city ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }

    if (city) {
      where += ` AND e.city ILIKE $${idx}`;
      params.push(`%${city}%`);
      idx++;
    }

    // Total
    const countResult = await query(
      `SELECT COUNT(*) FROM events e ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Événements
    const result = await query(`
      SELECT
        e.id, e.title, e.slug, e.description, e.cover_url,
        e.location_type, e.address, e.district, e.city, e.country,
        e.online_url, e.start_date, e.end_date, e.timezone, e.capacity,
        o.name AS organizer_name, o.org_name, o.org_slug, o.logo_url,
        COUNT(r.id) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')) AS registrations_count,
        MIN(tt.price) AS min_price,
        MAX(tt.price) AS max_price,
        BOOL_OR(tt.price = 0) AS has_free_ticket,
        BOOL_OR(tt.is_active AND (tt.quantity IS NULL OR tt.sold < tt.quantity)) AS has_available_tickets
      FROM events e
      JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN registrations r ON r.event_id = e.id
      LEFT JOIN ticket_types tt ON tt.event_id = e.id AND tt.is_active = true
      ${where}
      GROUP BY e.id, o.id
      ORDER BY e.start_date ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: {
        events: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
        filters: { q, city },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /public/events/:slug ─────────────────────────────────────
// Détail complet d'un événement public
async function getPublicEvent(req, res, next) {
  try {
    const { slug } = req.params;

    const evResult = await query(`
      SELECT
        e.*,
        o.name AS organizer_name, o.org_name, o.org_slug,
        o.logo_url AS organizer_logo,
        COUNT(r.id) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')) AS confirmed_count
      FROM events e
      JOIN organizers o ON o.id = e.organizer_id
      LEFT JOIN registrations r ON r.event_id = e.id
      WHERE e.slug = $1 AND e.status = 'PUBLISHED'
      GROUP BY e.id, o.id
    `, [slug]);

    if (!evResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Événement introuvable ou non publié' });
    }

    const event = evResult.rows[0];

    // Billets disponibles
    const ticketsResult = await query(`
      SELECT
        id, name, description, price, currency,
        quantity, sold, sale_start, sale_end, is_active, sort_order,
        CASE
          WHEN quantity IS NULL THEN true
          WHEN sold < quantity THEN true
          ELSE false
        END AS is_available,
        CASE
          WHEN quantity IS NULL THEN NULL
          ELSE quantity - sold
        END AS remaining
      FROM ticket_types
      WHERE event_id = $1 AND is_active = true
        AND (sale_start IS NULL OR sale_start <= NOW())
        AND (sale_end IS NULL OR sale_end >= NOW())
      ORDER BY sort_order ASC, price ASC
    `, [event.id]);

    res.json({
      success: true,
      data: {
        event,
        ticket_types: ticketsResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /public/events/:slug/register ──────────────────────────
// Inscription publique à un événement
async function registerPublic(req, res, next) {
  const client = await require('../db').getClient();
  try {
    await client.query('BEGIN');

    const { slug } = req.params;
    const {
      first_name, last_name, email, phone,
      ticket_type_id, promo_code,
      // champs personnalisés éventuels
      custom_fields = {},
    } = req.body;

    // Validation basique
    if (!first_name || !last_name || !email || !ticket_type_id) {
      return res.status(400).json({ success: false, error: 'Prénom, nom, email et type de billet sont obligatoires' });
    }

    // Email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Email invalide' });
    }

    // Récupérer l'événement
    const evResult = await client.query(
      `SELECT * FROM events WHERE slug = $1 AND status = 'PUBLISHED'`,
      [slug]
    );
    if (!evResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Événement introuvable ou non publié' });
    }
    const event = evResult.rows[0];

    // Récupérer le billet (avec lock)
    const tkResult = await client.query(
      `SELECT * FROM ticket_types WHERE id = $1 AND event_id = $2 AND is_active = true FOR UPDATE`,
      [ticket_type_id, event.id]
    );
    if (!tkResult.rows.length) {
      return res.status(400).json({ success: false, error: 'Type de billet invalide ou inactif' });
    }
    const ticket = tkResult.rows[0];

    // Vérifier période de vente
    const now = new Date();
    if (ticket.sale_start && new Date(ticket.sale_start) > now) {
      return res.status(400).json({ success: false, error: 'La vente de ce billet n\'a pas encore commencé' });
    }
    if (ticket.sale_end && new Date(ticket.sale_end) < now) {
      return res.status(400).json({ success: false, error: 'La vente de ce billet est terminée' });
    }

    // Vérifier disponibilité
    if (ticket.quantity !== null && ticket.sold >= ticket.quantity) {
      return res.status(400).json({ success: false, error: 'Ce type de billet est épuisé' });
    }

    // Vérifier capacité globale de l'événement
    if (event.capacity) {
      const totalResult = await client.query(
        `SELECT COUNT(*) FROM registrations WHERE event_id = $1 AND status IN ('CONFIRMED','MANUAL','PENDING')`,
        [event.id]
      );
      if (parseInt(totalResult.rows[0].count) >= event.capacity) {
        return res.status(400).json({ success: false, error: 'L\'événement est complet' });
      }
    }

    // Vérifier doublon email pour cet événement
    const dupResult = await client.query(
      `SELECT id FROM registrations WHERE event_id = $1 AND email = $2 AND status != 'CANCELLED'`,
      [event.id, email.toLowerCase()]
    );
    if (dupResult.rows.length) {
      return res.status(400).json({ success: false, error: 'Cet email est déjà inscrit à cet événement' });
    }

    // Appliquer code promo
    let promoId = null;
    let discountAmount = 0;
    let finalPrice = parseFloat(ticket.price);

    if (promo_code) {
      const promoResult = await client.query(
        `SELECT * FROM promo_codes
         WHERE event_id = $1 AND code = $2 AND is_active = true
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR used_count < max_uses)
         FOR UPDATE`,
        [event.id, promo_code.toUpperCase()]
      );
      if (!promoResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Code promo invalide ou expiré' });
      }
      const promo = promoResult.rows[0];
      promoId = promo.id;
      if (promo.discount_type === 'PERCENTAGE') {
        discountAmount = finalPrice * (promo.discount_value / 100);
      } else {
        discountAmount = Math.min(promo.discount_value, finalPrice);
      }
      finalPrice = Math.max(0, finalPrice - discountAmount);
    }

    // Générer code billet unique
    let ticketCode;
    let codeExists = true;
    while (codeExists) {
      ticketCode = generateTicketCode();
      const check = await client.query(
        `SELECT id FROM registrations WHERE ticket_code = $1`,
        [ticketCode]
      );
      codeExists = check.rows.length > 0;
    }

    // Statut initial
    const status = finalPrice === 0 ? 'CONFIRMED' : 'PENDING';
    const paymentMethod = finalPrice === 0 ? 'FREE' : null;

    // Créer l'inscription
    const regResult = await client.query(`
      INSERT INTO registrations (
        event_id, ticket_type_id, promo_code_id,
        first_name, last_name, email, phone,
        ticket_code, status, payment_method,
        amount_paid, discount_amount,
        paid_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      event.id, ticket.id, promoId,
      first_name.trim(), last_name.trim(), email.toLowerCase().trim(), phone || null,
      ticketCode, status, paymentMethod,
      finalPrice, discountAmount,
      finalPrice === 0 ? new Date() : null,
    ]);
    const registration = regResult.rows[0];

    // Incrémenter billets vendus
    await client.query(
      `UPDATE ticket_types SET sold = sold + 1 WHERE id = $1`,
      [ticket.id]
    );

    // Incrémenter promo utilisée
    if (promoId) {
      await client.query(
        `UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1`,
        [promoId]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        registration: {
          ...registration,
          ticket_type_name: ticket.name,
          event_title: event.title,
          event_slug: slug,
          event_start: event.start_date,
          event_location: [event.district, event.city].filter(Boolean).join(', '),
        },
        message: finalPrice === 0
          ? 'Inscription confirmée ! Votre billet vous a été envoyé.'
          : 'Inscription créée. Procédez au paiement pour confirmer.',
        payment_required: finalPrice > 0,
        amount_due: finalPrice,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /public/confirm/:ticketCode ─────────────────────────────
// Page de confirmation / récupération d'un billet par son code
async function getConfirmation(req, res, next) {
  try {
    const { ticketCode } = req.params;

    const result = await query(`
      SELECT
        r.*,
        tt.name AS ticket_type_name, tt.price AS ticket_price,
        e.title AS event_title, e.slug AS event_slug,
        e.start_date, e.end_date, e.timezone,
        e.address, e.district, e.city, e.country,
        e.location_type, e.online_url, e.cover_url,
        o.name AS organizer_name, o.org_name, o.logo_url AS organizer_logo
      FROM registrations r
      JOIN ticket_types tt ON tt.id = r.ticket_type_id
      JOIN events e ON e.id = r.event_id
      JOIN organizers o ON o.id = e.organizer_id
      WHERE r.ticket_code = $1
    `, [ticketCode.toUpperCase()]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Billet introuvable' });
    }

    res.json({ success: true, data: { registration: result.rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ─── GET /public/organizers/:orgSlug ─────────────────────────────
// Page publique d'un organisateur + ses événements à venir
async function getPublicOrganizer(req, res, next) {
  try {
    const { orgSlug } = req.params;

    const orgResult = await query(
      `SELECT id, name, org_name, org_slug, logo_url, country, timezone
       FROM organizers WHERE org_slug = $1`,
      [orgSlug]
    );
    if (!orgResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Organisateur introuvable' });
    }
    const organizer = orgResult.rows[0];

    const eventsResult = await query(`
      SELECT
        e.id, e.title, e.slug, e.description, e.cover_url,
        e.location_type, e.city, e.start_date, e.end_date, e.status,
        COUNT(r.id) FILTER (WHERE r.status IN ('CONFIRMED','MANUAL')) AS registrations_count,
        MIN(tt.price) AS min_price,
        BOOL_OR(tt.price = 0) AS has_free_ticket
      FROM events e
      LEFT JOIN registrations r ON r.event_id = e.id
      LEFT JOIN ticket_types tt ON tt.event_id = e.id AND tt.is_active = true
      WHERE e.organizer_id = $1 AND e.status = 'PUBLISHED'
      GROUP BY e.id
      ORDER BY e.start_date ASC
    `, [organizer.id]);

    res.json({
      success: true,
      data: {
        organizer,
        events: eventsResult.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /public/cities ───────────────────────────────────────────
// Liste des villes avec événements (pour les filtres de recherche)
async function getCities(req, res, next) {
  try {
    const result = await query(`
      SELECT DISTINCT city, COUNT(*) AS event_count
      FROM events
      WHERE status = 'PUBLISHED' AND end_date > NOW() AND city IS NOT NULL
      GROUP BY city
      ORDER BY event_count DESC
      LIMIT 20
    `);
    res.json({ success: true, data: { cities: result.rows } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPublicEvents,
  getPublicEvent,
  registerPublic,
  getConfirmation,
  getPublicOrganizer,
  getCities,
};