const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/AuthController");
const UserController = require("../controllers/UserController");

router.route("/register").post(AuthController.registerNewTestUser);

router.route("/testAddSectors").get(AuthController.registerMacroStocksToUser)

module.exports = router;
