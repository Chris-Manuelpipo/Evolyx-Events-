// src/routes/members.js
const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams pour accéder à :id depuis le parent
const auth = require('../middlewares/auth');
const { requireEventRole } = require('../middlewares/roles');
const {
  getMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  cancelInvitation,
  getMyRole,
} = require('../controllers/membersController');

// Tous protégés + vérification rôle sur l'événement
router.get('/',
  auth,
  requireEventRole(['OWNER', 'ADMIN']),
  getMembers
);

router.get('/my-role',
  auth,
  getMyRole
);

router.post('/invite',
  auth,
  requireEventRole(['OWNER', 'ADMIN']),
  inviteMember
);

router.patch('/:memberId',
  auth,
  requireEventRole(['OWNER']),        // seul le OWNER change les rôles
  updateMemberRole
);

router.delete('/:memberId',
  auth,
  requireEventRole(['OWNER', 'ADMIN']),
  removeMember
);

router.delete('/invitations/:invitationId',
  auth,
  requireEventRole(['OWNER', 'ADMIN']),
  cancelInvitation
);

module.exports = router;