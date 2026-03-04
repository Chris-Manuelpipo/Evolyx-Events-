const slugify = require("slugify");

/**
 * Générer un slug propre depuis un texte
 */
const generateSlug = (text) => {
  return slugify(text, {
    lower:  true,
    strict: true,
    locale: "fr",
  });
};

/**
 * Générer un ID court unique (pour les slugs et codes)
 */
const generateUniqueId = (length = 6) => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Générer un code de billet unique
 * Format : EVX-XXXXXXXXXX
 */
const generateTicketCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `EVX-${code}`;
};

/**
 * Calculer le montant après réduction
 */
const applyDiscount = (price, discountType, discountValue) => {
  if (discountType === "PERCENTAGE") {
    return Math.max(0, price - (price * discountValue) / 100);
  }
  return Math.max(0, price - discountValue);
};

/**
 * Formater une réponse d'erreur propre
 */
const createError = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

module.exports = {
  generateSlug,
  generateUniqueId,
  generateTicketCode,
  applyDiscount,
  createError,
};