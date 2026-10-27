const express = require("express");
const { register, login, logout, getCurrentUser, changePassword } = require("./auth.controller");
const { requireAuth } = require("./auth.middleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, getCurrentUser);
router.post("/change-password", requireAuth, changePassword);

module.exports = router;
