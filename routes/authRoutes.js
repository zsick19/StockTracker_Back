const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/AuthController");
const UserController = require("../controllers/UserController");

router.route("/register").post(AuthController.registerNewTestUser);


module.exports = router;
