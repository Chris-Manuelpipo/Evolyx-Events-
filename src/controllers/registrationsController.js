const { query, getClient } = require("../db");
const { generateTicketCode, applyDiscount } = require("../utils");
const { prepareTicketData } = require("../services/ticketService");

/**
 * GET /api/events/:eventId/registrations
 * Liste des participants d'un événement
 */
const getRegistrations = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Vérifier la propriété
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

    const params = [eventId];
    let whereClause = "WHERE r.event_id = $1";

    if (status) {
      params.push(status.toUpperCase());
      whereClause += ` AND r.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (
        r.first_name ILIKE $${params.length} OR
        r.last_name  ILIKE $${params.length} OR
        r.email      ILIKE $${params.length} OR
        r.ticket_code ILIKE $${params.length}
      )`;
    }

    const result = await query(
      `SELECT r.*, tt.name AS ticket_type_name, tt.price AS ticket_price
       FROM registrations r
       JOIN ticket_types tt ON tt.id = r.ticket_type_id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM registrations r ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        registrations: result.rows,
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
 * POST /api/events/:eventId/registrations
 * Inscrire un participant
 */
const createRegistration = async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    const { eventId } = req.params;
    const {
      first_name, last_name, email, phone,
      ticket_type_id, promo_code,
    } = req.body;

    // 1. Vérifier que l'événement est publié
    const eventResult = await client.query(
      `SELECT * FROM events WHERE id = $1 AND status = 'PUBLISHED'`,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable ou non disponible",
      });
    }

    const event = eventResult.rows[0];

    // 2. Vérifier le type de billet
    const ticketResult = await client.query(
      `SELECT * FROM ticket_types
       WHERE id = $1 AND event_id = $2 AND is_active = TRUE
       FOR UPDATE`,
      [ticket_type_id, eventId]
    );

    if (ticketResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        error:   "Type de billet introuvable ou inactif",
      });
    }

    const ticketType = ticketResult.rows[0];

    // 3. Vérifier la disponibilité
    if (ticketType.quantity !== null &&
        ticketType.sold >= ticketType.quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error:   "Ce type de billet est épuisé",
      });
    }

    // 4. Vérifier les dates de vente
    const now = new Date();
    if (ticketType.sale_start && now < new Date(ticketType.sale_start)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error:   "La vente de ce billet n'a pas encore commencé",
      });
    }

    if (ticketType.sale_end && now > new Date(ticketType.sale_end)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error:   "La vente de ce billet est terminée",
      });
    }

    // 5. Vérifier le code promo si fourni
    let promoData       = null;
    let discount_amount = 0;
    let promo_code_id   = null;

    if (promo_code) {
      const promoResult = await client.query(
        `SELECT * FROM promo_codes
         WHERE event_id = $1
           AND code = $2
           AND is_active = TRUE
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR used_count < max_uses)
         FOR UPDATE`,
        [eventId, promo_code.trim().toUpperCase()]
      );

      if (promoResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error:   "Code promo invalide ou expiré",
        });
      }

      promoData       = promoResult.rows[0];
      promo_code_id   = promoData.id;
      discount_amount = applyDiscount(
        parseFloat(ticketType.price),
        promoData.discount_type,
        parseFloat(promoData.discount_value)
      );
      discount_amount = parseFloat(ticketType.price) - discount_amount;
    }

    // 6. Calculer le montant final
    const amount_paid     = Math.max(
      0,
      parseFloat(ticketType.price) - discount_amount
    );
    const payment_method  = amount_paid === 0 ? "FREE" : null;
    const status          = amount_paid === 0 ? "CONFIRMED" : "PENDING";
    const ticket_code     = generateTicketCode();

    // 7. Créer l'inscription
    const regResult = await client.query(
      `INSERT INTO registrations
         (event_id, ticket_type_id, promo_code_id,
          first_name, last_name, email, phone,
          ticket_code, status, payment_method,
          amount_paid, discount_amount, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        eventId, ticket_type_id, promo_code_id,
        first_name.trim(), last_name.trim(),
        email.toLowerCase(), phone || null,
        ticket_code, status, payment_method,
        amount_paid, discount_amount,
        amount_paid === 0 ? new Date() : null,
      ]
    );

    const registration = regResult.rows[0];

    // 8. Incrémenter le compteur de billets vendus
    await client.query(
      "UPDATE ticket_types SET sold = sold + 1 WHERE id = $1",
      [ticket_type_id]
    );

    // 9. Incrémenter le compteur du code promo si utilisé
    if (promo_code_id) {
      await client.query(
        "UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1",
        [promo_code_id]
      );
    }

    await client.query("COMMIT");

    // 10. Générer les données du billet avec QR code
    const ticketData = await prepareTicketData(
      registration, event, ticketType
    );

    res.status(201).json({
      success: true,
      message: amount_paid === 0
        ? "Inscription confirmée"
        : "Inscription créée — en attente de paiement",
      data: {
        registration,
        ticket: ticketData,
      },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/events/:eventId/registrations/:id
 * Détail d'une inscription
 */
const getRegistration = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;

    const result = await query(
      `SELECT r.*, tt.name AS ticket_type_name,
              tt.price AS ticket_price, tt.currency
       FROM registrations r
       JOIN ticket_types tt ON tt.id = r.ticket_type_id
       WHERE r.id = $1 AND r.event_id = $2`,
      [id, eventId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Inscription introuvable",
      });
    }

    res.json({
      success: true,
      data:    { registration: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/events/:eventId/registrations/:id/confirm
 * Confirmer manuellement une inscription
 */
const confirmRegistration = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;
    const { payment_ref } = req.body;

    // Vérifier la propriété
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
      `UPDATE registrations SET
         status         = 'MANUAL',
         payment_method = 'MANUAL',
         payment_ref    = COALESCE($1, payment_ref),
         paid_at        = NOW(),
         updated_at     = NOW()
       WHERE id = $2 AND event_id = $3 AND status = 'PENDING'
       RETURNING *`,
      [payment_ref || null, id, eventId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Inscription introuvable ou déjà confirmée",
      });
    }

    res.json({
      success: true,
      message: "Inscription confirmée manuellement",
      data:    { registration: result.rows[0] },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/events/:eventId/registrations/:id/cancel
 * Annuler une inscription
 */
const cancelRegistration = async (req, res, next) => {
  try {
    const { eventId, id } = req.params;

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

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `UPDATE registrations SET
           status     = 'CANCELLED',
           updated_at = NOW()
         WHERE id = $1 AND event_id = $2
           AND status NOT IN ('CANCELLED','REFUNDED')
         RETURNING *`,
        [id, eventId]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          error:   "Inscription introuvable ou déjà annulée",
        });
      }

      // Décrémenter le compteur de billets vendus
      await client.query(
        "UPDATE ticket_types SET sold = GREATEST(sold - 1, 0) WHERE id = $1",
        [result.rows[0].ticket_type_id]
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Inscription annulée",
        data:    { registration: result.rows[0] },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/events/:eventId/registrations/export
 * Exporter les participants en CSV
 */
const exportRegistrations = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const eventCheck = await query(
      "SELECT title FROM events WHERE id = $1 AND organizer_id = $2",
      [eventId, req.organizer.id]
    );

    if (eventCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   "Événement introuvable",
      });
    }

    const result = await query(
      `SELECT
         r.ticket_code, r.first_name, r.last_name,
         r.email, r.phone, tt.name AS ticket_type,
         r.amount_paid, r.status, r.payment_method,
         r.checked_in, r.checked_in_at, r.created_at
       FROM registrations r
       JOIN ticket_types tt ON tt.id = r.ticket_type_id
       WHERE r.event_id = $1
       ORDER BY r.created_at ASC`,
      [eventId]
    );

    // Générer le CSV
    const headers = [
      "Code billet", "Prénom", "Nom", "Email", "Téléphone",
      "Type billet", "Montant payé", "Statut", "Méthode paiement",
      "Présent", "Heure check-in", "Date inscription",
    ];

    const rows = result.rows.map((r) => [
      r.ticket_code,
      r.first_name,
      r.last_name,
      r.email,
      r.phone || "",
      r.ticket_type,
      r.amount_paid,
      r.status,
      r.payment_method || "",
      r.checked_in ? "Oui" : "Non",
      r.checked_in_at ? new Date(r.checked_in_at).toISOString() : "",
      new Date(r.created_at).toISOString(),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${v}"`).join(","))
      .join("\n");

    const filename = `participants-${eventCheck.rows[0].title
      .replace(/\s+/g, "-")
      .toLowerCase()}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv); // BOM pour Excel

  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRegistrations,
  createRegistration,
  getRegistration,
  confirmRegistration,
  cancelRegistration,
  exportRegistrations,
};