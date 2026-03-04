const { Pool } = require("pg");
const config   = require("../config");

const pool = new Pool({
  host:     config.db.host,
  port:     config.db.port,
  database: config.db.name,
  user:     config.db.user,
  password: config.db.password,
});

// Test de connexion au démarrage
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Erreur connexion PostgreSQL :", err.message);
    process.exit(1);
  }
  console.log("✅ PostgreSQL connecté");
  release();
});

/**
 * Exécuter une requête SQL
 * @param {string} text   - Requête SQL
 * @param {Array}  params - Paramètres (protection injection SQL)
 * @returns {Promise}
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.server.env === "development") {
      console.log(`Requête (Query) (${duration}ms):`, text.substring(0, 80));
    }
    return result;
  } catch (err) {
    console.error("❌ Erreur SQL :", err.message);
    throw err;
  }
};

/**
 * Obtenir un client pour les transactions
 * @returns {Promise}
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };