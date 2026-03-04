require("dotenv").config();

const config = {
  server: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || "development",
  },
  db: {
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 5432,
    name:     process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwt: {
    secret:    process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
};

// Vérification des variables obligatoires au démarrage
const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "JWT_SECRET"];
required.forEach((key) => {
  if (!process.env[key]) {
    console.error(` ===Variable d'environnement manquante : ${key}===`);
    process.exit(1);
  }
});

module.exports = config;