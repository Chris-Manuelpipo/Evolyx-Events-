# Evolyx Events — Documentation API

Base URL : `http://localhost:5000`

## Authentification
Toutes les routes protégées nécessitent le header :
`Authorization: Bearer <token>`

---

## AUTH

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/register | ❌ | Créer un compte |
| POST | /api/auth/login | ❌ | Connexion |
| GET | /api/auth/me | ✅ | Profil connecté |
| PUT | /api/auth/me | ✅ | Modifier profil |
| PUT | /api/auth/change-password | ✅ | Changer mot de passe |

---

## ÉVÉNEMENTS

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/events | ✅ | Liste événements |
| POST | /api/events | ✅ | Créer événement |
| GET | /api/events/:id | ✅ | Détail événement |
| PUT | /api/events/:id | ✅ | Modifier événement |
| DELETE | /api/events/:id | ✅ | Supprimer (DRAFT) |
| POST | /api/events/:id/publish | ✅ | Publier |
| GET | /api/events/:id/stats | ✅ | Statistiques |

---

## BILLETTERIE

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/events/:eventId/tickets | ✅ | Liste billets |
| POST | /api/events/:eventId/tickets | ✅ | Créer billet |
| PUT | /api/events/:eventId/tickets/:id | ✅ | Modifier billet |
| DELETE | /api/events/:eventId/tickets/:id | ✅ | Supprimer billet |

---

## CODES PROMO

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/events/:eventId/promos | ✅ | Liste promos |
| POST | /api/events/:eventId/promos | ✅ | Créer promo |
| POST | /api/events/:eventId/promos/verify | ❌ | Vérifier code |
| PATCH | /api/events/:eventId/promos/:id/toggle | ✅ | Activer/désactiver |
| DELETE | /api/events/:eventId/promos/:id | ✅ | Supprimer |

---

## INSCRIPTIONS

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/events/:eventId/registrations | ❌ | S'inscrire |
| GET | /api/events/:eventId/registrations | ✅ | Liste participants |
| GET | /api/events/:eventId/registrations/export | ✅ | Export CSV |
| GET | /api/events/:eventId/registrations/:id | ✅ | Détail inscription |
| PATCH | /api/events/:eventId/registrations/:id/confirm | ✅ | Confirmer manuellement |
| PATCH | /api/events/:eventId/registrations/:id/cancel | ✅ | Annuler |

---

## CHECK-IN

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/checkin/scan | ❌ | Scanner un billet |
| GET | /api/checkin/:eventId/stats | ✅ | Stats temps réel |
| GET | /api/checkin/:eventId/list | ✅ | Liste offline |

---

## DASHBOARD

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/dashboard | ✅ | Stats globales |
| GET | /api/dashboard/activity | ✅ | Activité 30 jours |