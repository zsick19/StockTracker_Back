const express = require("express");
const router = express.Router();
const TradeController = require('../controllers/TradeController')
const UserController = require("../controllers/UserController");
const WatchListController = require("../controllers/WatchListController");

router.route("/active")
    .get(TradeController.fetchUsersActiveTradesWithStream)

router.route('/enterPosition')
    .post(TradeController.createTradeRecord)


module.exports = router;
