const express = require("express");
const { signup, login, me, verifyEmailOtp, resendOtp } = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/verify-otp", verifyEmailOtp);
router.post("/resend-otp", resendOtp);
router.get("/me", requireAuth, me);

module.exports = router;
