/**
 * Validateurs pour les routes événements
 */

const validateCreateEvent = (req, res, next) => {
  const { title, start_date, end_date, location_type } = req.body;
  const errors = [];

  if (!title || title.trim().length < 3) {
    errors.push("Le titre doit contenir au moins 3 caractères");
  }

  if (!start_date) {
    errors.push("La date de début est requise");
  }

  if (!end_date) {
    errors.push("La date de fin est requise");
  }

  if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
    errors.push("La date de fin doit être après la date de début");
  }

  const validTypes = ["PHYSICAL", "ONLINE", "HYBRID"];
  if (location_type && !validTypes.includes(location_type)) {
    errors.push("Type de lieu invalide : PHYSICAL, ONLINE ou HYBRID");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error:   "Données invalides",
      details: errors,
    });
  }

  next();
};

const validateUpdateEvent = (req, res, next) => {
  const { start_date, end_date, location_type, status } = req.body;
  const errors = [];

  if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
    errors.push("La date de fin doit être après la date de début");
  }

  const validTypes = ["PHYSICAL", "ONLINE", "HYBRID"];
  if (location_type && !validTypes.includes(location_type)) {
    errors.push("Type de lieu invalide : PHYSICAL, ONLINE ou HYBRID");
  }

  const validStatuses = ["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"];
  if (status && !validStatuses.includes(status)) {
    errors.push("Statut invalide : DRAFT, PUBLISHED, CANCELLED ou COMPLETED");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error:   "Données invalides",
      details: errors,
    });
  }

  next();
};

module.exports = { validateCreateEvent, validateUpdateEvent };