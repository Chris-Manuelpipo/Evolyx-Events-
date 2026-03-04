/**
 * Validateurs pour les routes billetterie
 */

const validateCreateTicket = (req, res, next) => {
  const { name, price } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2) {
    errors.push("Le nom du billet doit contenir au moins 2 caractères");
  }

  if (price === undefined || price === null) {
    errors.push("Le prix est requis (0 pour un billet gratuit)");
  }

  if (price !== undefined && (isNaN(price) || price < 0)) {
    errors.push("Le prix doit être un nombre positif ou zéro");
  }

  if (req.body.quantity !== undefined && req.body.quantity !== null) {
    if (isNaN(req.body.quantity) || req.body.quantity < 1) {
      errors.push("La quantité doit être un nombre supérieur à 0");
    }
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

const validateCreatePromo = (req, res, next) => {
  const { code, discount_type, discount_value } = req.body;
  const errors = [];

  if (!code || code.trim().length < 2) {
    errors.push("Le code promo doit contenir au moins 2 caractères");
  }

  const validTypes = ["PERCENTAGE", "FIXED"];
  if (!discount_type || !validTypes.includes(discount_type)) {
    errors.push("Type de réduction invalide : PERCENTAGE ou FIXED");
  }

  if (!discount_value || isNaN(discount_value) || discount_value <= 0) {
    errors.push("La valeur de réduction doit être un nombre positif");
  }

  if (discount_type === "PERCENTAGE" && discount_value > 100) {
    errors.push("Le pourcentage de réduction ne peut pas dépasser 100%");
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

module.exports = { validateCreateTicket, validateCreatePromo };