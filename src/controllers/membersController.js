// src/controllers/membersController.js
const { query, getClient } = require('../db');
const crypto = require('crypto');

// ─── GET /api/events/:id/members ─────────────────────────────────
async function getMembers(req, res, next) {
  try {
    const eventId = req.params.id;

    const result = await query(`
      SELECT
        em.id, em.role, em.joined_at,
        o.id AS organizer_id, o.name, o.email, o.phone,
        o.org_name,
        inv.id AS invitation_id
      FROM event_members em
      JOIN organizers o ON o.id = em.organizer_id
      LEFT JOIN invitations inv ON inv.event_id = em.event_id AND inv.email = o.email AND inv.accepted_at IS NOT NULL
      WHERE em.event_id = $1
      ORDER BY
        CASE em.role WHEN 'OWNER' THEN 1 WHEN 'ADMIN' THEN 2 WHEN 'COMPTABLE' THEN 3 WHEN 'MARKETER' THEN 4 ELSE 5 END,
        em.joined_at ASC
    `, [eventId]);

    // Invitations en attente (pas encore acceptées)
    const pending = await query(`
      SELECT id, email, role, expires_at, created_at
      FROM invitations
      WHERE event_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
    `, [eventId]);

    res.json({
      success: true,
      data: {
        members: result.rows,
        pending_invitations: pending.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/events/:id/members/invite ─────────────────────────
async function inviteMember(req, res, next) {
  try {
    const eventId = req.params.id;
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ success: false, error: 'Email et rôle sont obligatoires' });
    }

    const validRoles = ['ADMIN', 'STAFF', 'COMPTABLE', 'MARKETER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: `Rôle invalide. Valeurs acceptées : ${validRoles.join(', ')}` });
    }

    // Vérifier que l'événement existe
    const evResult = await query(`SELECT id, title FROM events WHERE id = $1`, [eventId]);
    if (!evResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Événement introuvable' });
    }

    // Vérifier si déjà membre
    const existing = await query(`
      SELECT em.id FROM event_members em
      JOIN organizers o ON o.id = em.organizer_id
      WHERE em.event_id = $1 AND LOWER(o.email) = LOWER($2)
    `, [eventId, email]);

    if (existing.rows.length) {
      return res.status(400).json({ success: false, error: 'Cette personne est déjà membre de cet événement' });
    }

    // Supprimer invitation existante (si expired ou doublon)
    await query(`DELETE FROM invitations WHERE event_id = $1 AND email = $2`, [eventId, email.toLowerCase()]);

    // Générer token sécurisé
    const token = crypto.randomBytes(32).toString('hex');

    // Créer l'invitation
    const inv = await query(`
      INSERT INTO invitations (event_id, email, role, token, invited_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [eventId, email.toLowerCase(), role, token, req.organizer.id]);

    // TODO: envoyer email avec lien d'invitation
    // Le lien serait : /invitations/accept/{token}
    const inviteLink = `http://localhost:3000/invitations/accept/${token}`;

    res.status(201).json({
      success: true,
      data: {
        invitation: inv.rows[0],
        invite_link: inviteLink,
      },
      message: `Invitation envoyée à ${email} (rôle : ${role})`,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/invitations/accept/:token ─────────────────────────
// L'invité clique sur le lien et accepte (doit être connecté)
async function acceptInvitation(req, res, next) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { token } = req.params;
    const organizerId = req.organizer.id;

    // Vérifier le token
    const invResult = await client.query(`
      SELECT * FROM invitations
      WHERE token = $1 AND accepted_at IS NULL AND expires_at > NOW()
    `, [token]);

    if (!invResult.rows.length) {
      return res.status(400).json({ success: false, error: 'Invitation invalide ou expirée' });
    }

    const inv = invResult.rows[0];

    // Vérifier que l'email correspond
    if (inv.email !== req.organizer.email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: `Cette invitation est destinée à ${inv.email}`,
      });
    }

    // Vérifier pas déjà membre
    const existingMember = await client.query(
      `SELECT id FROM event_members WHERE event_id = $1 AND organizer_id = $2`,
      [inv.event_id, organizerId]
    );

    if (existingMember.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Vous êtes déjà membre de cet événement' });
    }

    // Ajouter comme membre
    await client.query(`
      INSERT INTO event_members (event_id, organizer_id, role, invited_by)
      VALUES ($1, $2, $3, $4)
    `, [inv.event_id, organizerId, inv.role, inv.invited_by]);

    // Marquer invitation acceptée
    await client.query(
      `UPDATE invitations SET accepted_at = NOW() WHERE id = $1`,
      [inv.id]
    );

    // Récupérer les infos de l'événement
    const evResult = await client.query(
      `SELECT id, title, slug FROM events WHERE id = $1`,
      [inv.event_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        event: evResult.rows[0],
        role: inv.role,
      },
      message: `Vous avez rejoint "${evResult.rows[0].title}" en tant que ${inv.role}`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── PATCH /api/events/:id/members/:memberId ─────────────────────
async function updateMemberRole(req, res, next) {
  try {
    const { id: eventId, memberId } = req.params;
    const { role } = req.body;

    const validRoles = ['ADMIN', 'STAFF', 'COMPTABLE', 'MARKETER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Rôle invalide' });
    }

    // Ne peut pas changer le rôle du OWNER
    const targetResult = await query(
      `SELECT role FROM event_members WHERE id = $1 AND event_id = $2`,
      [memberId, eventId]
    );

    if (!targetResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Membre introuvable' });
    }

    if (targetResult.rows[0].role === 'OWNER') {
      return res.status(400).json({ success: false, error: 'Impossible de modifier le rôle du propriétaire' });
    }

    const result = await query(
      `UPDATE event_members SET role = $1 WHERE id = $2 AND event_id = $3 RETURNING *`,
      [role, memberId, eventId]
    );

    res.json({ success: true, data: { member: result.rows[0] } });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/events/:id/members/:memberId ─────────────────────
async function removeMember(req, res, next) {
  try {
    const { id: eventId, memberId } = req.params;

    const targetResult = await query(
      `SELECT role, organizer_id FROM event_members WHERE id = $1 AND event_id = $2`,
      [memberId, eventId]
    );

    if (!targetResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Membre introuvable' });
    }

    if (targetResult.rows[0].role === 'OWNER') {
      return res.status(400).json({ success: false, error: 'Impossible de retirer le propriétaire' });
    }

    await query(`DELETE FROM event_members WHERE id = $1`, [memberId]);

    res.json({ success: true, message: 'Membre retiré avec succès' });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/invitations/:invitationId ────────────────────────
async function cancelInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;
    const eventId = req.params.id;

    await query(
      `DELETE FROM invitations WHERE id = $1 AND event_id = $2`,
      [invitationId, eventId]
    );

    res.json({ success: true, message: 'Invitation annulée' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/events/:id/my-role ─────────────────────────────────
// Retourne le rôle de l'utilisateur connecté sur un événement
async function getMyRole(req, res, next) {
  try {
    const eventId = req.params.id;
    const organizerId = req.organizer.id;

    const result = await query(
      `SELECT role FROM event_members WHERE event_id = $1 AND organizer_id = $2`,
      [eventId, organizerId]
    );

    if (!result.rows.length) {
      // Vérifie si owner direct
      const ownerCheck = await query(
        `SELECT id FROM events WHERE id = $1 AND organizer_id = $2`,
        [eventId, organizerId]
      );
      if (ownerCheck.rows.length) {
        return res.json({ success: true, data: { role: 'OWNER' } });
      }
      return res.status(403).json({ success: false, error: 'Vous n\'avez pas accès à cet événement' });
    }

    res.json({ success: true, data: { role: result.rows[0].role } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMembers,
  inviteMember,
  acceptInvitation,
  updateMemberRole,
  removeMember,
  cancelInvitation,
  getMyRole,
};