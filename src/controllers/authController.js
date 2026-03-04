const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const config = require("../config");
const { query } = require("../db");
const { generateSlug, generateUniqueId, createError } = require("../utils");

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, org_name } = req.body;

    // Vérifier si l'email existe déjà
    const existing = await query(
      "SELECT id FROM organizers WHERE email = $1",
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error:   "Cet email est déjà utilisé",
      });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);

    // Générer un slug unique
    const base     = generateSlug(org_name || name);
    const org_slug = `${base}-${generateUniqueId(6)}`;

    // Créer l'organisateur
    const result = await query(
      `INSERT INTO organizers
         (email, password, name, phone, org_name, org_slug)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, phone, org_name, org_slug,
                 currency, timezone, country, created_at`,
      [
        email.toLowerCase(),
        hashedPassword,
        name.trim(),
        phone  || null,
        org_name || null,
        org_slug,
      ]
    );

    const organizer = result.rows[0];

    // Générer le JWT
    const token = jwt.sign(
      { id: organizer.id, email: organizer.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.status(201).json({
      success: true,
      message: "Compte créé avec succès",
      data:    { organizer, token },
    });

  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Chercher l'organisateur
    const result = await query(
      "SELECT * FROM organizers WHERE email = $1",
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error:   "Email ou mot de passe incorrect",
      });
    }

    const organizer = result.rows[0];

    // Vérifier le mot de passe
    const isValid = await bcrypt.compare(password, organizer.password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error:   "Email ou mot de passe incorrect",
      });
    }

    // Générer le JWT
    const token = jwt.sign(
      { id: organizer.id, email: organizer.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Retourner sans le mot de passe
    const { password: _, ...organizerSafe } = organizer;

    res.json({
      success: true,
      message: "Connexion réussie",
      data:    { organizer: organizerSafe, token },
    });

  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const me = async (req, res) => {
  res.json({
    success: true,
    data:    { organizer: req.organizer },
  });
};

/**
 * PUT /api/auth/me
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, org_name, currency, timezone } = req.body;

    const result = await query(
      `UPDATE organizers
       SET name       = COALESCE($1, name),
           phone      = COALESCE($2, phone),
           org_name   = COALESCE($3, org_name),
           currency   = COALESCE($4, currency),
           timezone   = COALESCE($5, timezone),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, email, name, phone, org_name, org_slug,
                 currency, timezone, country`,
      [name, phone, org_name, currency, timezone, req.organizer.id]
    );

    res.json({
      success: true,
      message: "Profil mis à jour",
      data:    { organizer: result.rows[0] },
    });

  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        error:   "Les deux mots de passe sont requis",
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        error:   "Le nouveau mot de passe doit contenir au moins 6 caractères",
      });
    }

    // Récupérer le mot de passe actuel
    const result = await query(
      "SELECT password FROM organizers WHERE id = $1",
      [req.organizer.id]
    );

    const isValid = await bcrypt.compare(
      current_password,
      result.rows[0].password
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error:   "Mot de passe actuel incorrect",
      });
    }

    const hashed = await bcrypt.hash(new_password, 12);
    await query(
      "UPDATE organizers SET password = $1, updated_at = NOW() WHERE id = $2",
      [hashed, req.organizer.id]
    );

    res.json({
      success: true,
      message: "Mot de passe mis à jour",
    });

  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, me, updateProfile, changePassword };