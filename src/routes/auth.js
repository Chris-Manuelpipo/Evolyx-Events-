const router = require("express").Router();
const authMiddleware = require("../middlewares/auth");
const { validateRegister, validateLogin } = require("../validators/auth");
const {
  register,
  login,
  me,
  updateProfile,
  changePassword,
} = require("../controllers/authController");

// Routes publiques
router.post("/register", validateRegister, register);
router.post("/login",    validateLogin,    login);

// Routes protégées
router.get ("/me",              authMiddleware, me);
router.put ("/me",              authMiddleware, updateProfile);
router.put ("/change-password", authMiddleware, changePassword);

module.exports = router;