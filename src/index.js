const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const morgan  = require("morgan");
const config  = require("./config");
const { errorHandler, notFound }                        = require("./middlewares/errorHandler");
const { globalLimiter, authLimiter, registrationLimiter } = require("./middlewares/rateLimiter");

const app = express();

// ── Middlewares globaux ──────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.server.env === "development" ? "dev" : "combined"));
app.use(globalLimiter);

// ── Route de santé ───────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Evolyx Events API is running",
    env:     config.server.env,
    time:    new Date().toISOString(),
  });
});

// ── Routes API ───────────────────────────────────
app.use("/api/auth",         authLimiter,         require("./routes/auth"));
app.use("/api/events",                            require("./routes/events"));
app.use("/api/events/:eventId/tickets",           require("./routes/tickets"));
app.use("/api/events/:eventId/registrations",     registrationLimiter, require("./routes/registrations"));
app.use("/api/checkin",                           require("./routes/checkin"));
app.use("/api/dashboard",                         require("./routes/dashboard"));

// ── Gestion des erreurs ──────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Démarrage ────────────────────────────────────
app.listen(config.server.port, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${config.server.port}`);
  console.log(`📦 Environnement : ${config.server.env}`);
});

module.exports = app;