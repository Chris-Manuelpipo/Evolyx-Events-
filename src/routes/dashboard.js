const router         = require("express").Router();
const authMiddleware = require("../middlewares/auth");
const {
  getDashboard,
  getActivity,
} = require("../controllers/dashboardController");

router.get("/",         authMiddleware, getDashboard);
router.get("/activity", authMiddleware, getActivity);

module.exports = router;