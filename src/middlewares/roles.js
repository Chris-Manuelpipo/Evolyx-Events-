// src/middlewares/roles.js
const { query } = require('../db');

// Permissions par rôle
const PERMISSIONS = {
  OWNER: [
    'event:read', 'event:write', 'event:delete', 'event:publish',
    'members:read', 'members:write', 'members:delete',
    'registrations:read', 'registrations:write', 'registrations:export',
    'tickets:read', 'tickets:write',
    'promos:read', 'promos:write',
    'checkin:read', 'checkin:write',
    'analytics:read', 'finance:read',
  ],
  ADMIN: [
    'event:read', 'event:write', 'event:publish',
    'members:read', 'members:write',
    'registrations:read', 'registrations:write', 'registrations:export',
    'tickets:read', 'tickets:write',
    'promos:read', 'promos:write',
    'checkin:read', 'checkin:write',
    'analytics:read', 'finance:read',
  ],
  STAFF: [
    'event:read',
    'checkin:read', 'checkin:write',
    'registrations:read',
  ],
  COMPTABLE: [
    'event:read',
    'registrations:read', 'registrations:export',
    'finance:read', 'analytics:read',
  ],
  MARKETER: [
    'event:read',
    'promos:read', 'promos:write',
    'analytics:read',
    'registrations:read',
  ],
};

// Vérifie si un rôle possède une permission
function hasPermission(role, permission) {
  return PERMISSIONS[role]?.includes(permission) || false;
}

// Middleware : vérifie le rôle sur un événement spécifique
// Usage : router.get('/:id/...', authMiddleware, requireEventRole(['OWNER','ADMIN']), handler)
function requireEventRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const eventId = req.params.id || req.params.eventId;
      const organizerId = req.organizer.id;

      const result = await query(
        `SELECT role FROM event_members
         WHERE event_id = $1 AND organizer_id = $2`,
        [eventId, organizerId]
      );

      // Vérifie aussi si c'est le owner direct de l'événement (rétrocompat)
      if (!result.rows.length) {
        const ownerCheck = await query(
          `SELECT id FROM events WHERE id = $1 AND organizer_id = $2`,
          [eventId, organizerId]
        );
        if (!ownerCheck.rows.length) {
          return res.status(403).json({
            success: false,
            error: 'Accès refusé — vous n\'êtes pas membre de cet événement',
          });
        }
        // C'est le owner direct → accès total
        req.memberRole = 'OWNER';
        req.permissions = PERMISSIONS.OWNER;
        return next();
      }

      const role = result.rows[0].role;

      if (allowedRoles.length && !allowedRoles.includes(role)) {
        return res.status(403).json({
          success: false,
          error: `Accès refusé — rôle requis : ${allowedRoles.join(' ou ')}. Votre rôle : ${role}`,
        });
      }

      req.memberRole = role;
      req.permissions = PERMISSIONS[role] || [];
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Middleware : vérifie une permission spécifique
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const eventId = req.params.id || req.params.eventId;
      const organizerId = req.organizer.id;

      // Cherche dans event_members
      const result = await query(
        `SELECT role FROM event_members WHERE event_id = $1 AND organizer_id = $2`,
        [eventId, organizerId]
      );

      let role;
      if (!result.rows.length) {
        // Vérifie owner direct
        const ownerCheck = await query(
          `SELECT id FROM events WHERE id = $1 AND organizer_id = $2`,
          [eventId, organizerId]
        );
        if (!ownerCheck.rows.length) {
          return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
        role = 'OWNER';
      } else {
        role = result.rows[0].role;
      }

      if (!hasPermission(role, permission)) {
        return res.status(403).json({
          success: false,
          error: `Accès refusé — permission "${permission}" requise. Votre rôle : ${role}`,
        });
      }

      req.memberRole = role;
      req.permissions = PERMISSIONS[role] || [];
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireEventRole, requirePermission, hasPermission, PERMISSIONS };