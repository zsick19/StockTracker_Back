const express = require("express");
const router = express.Router();
const UserController = require("../controllers/UserController");

router.route("/login/:userId").get(UserController.userLoginDataFetch);

module.exports = router;
