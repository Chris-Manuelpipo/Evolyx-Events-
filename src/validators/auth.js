/**
 * Validateurs pour les routes d'authentification
 * Validation manuelle — sans librairie externe
 */

const validateRegister = (req, res, next) => {
  const { name, email, password } = req.body;
  const errors = [];

  // Nom
  if (!name || name.trim().length < 2) {
    errors.push("Le nom doit contenir au moins 2 caractères");
  }

  // Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push("Email invalide");
  }

  // Mot de passe
  if (!password || password.length < 6) {
    errors.push("Le mot de passe doit contenir au moins 6 caractères");
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

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push("Email invalide");
  }

  if (!password || password.trim().length === 0) {
    errors.push("Mot de passe requis");
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

module.exports = { validateRegister, validateLogin };