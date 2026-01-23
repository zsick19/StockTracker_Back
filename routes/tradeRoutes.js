const express = require("express");
const router = express.Router();
const TradeController = require('../controllers/TradeController')
const UserController = require("../controllers/UserController");
const WatchListController = require("../controllers/WatchListController");

router.route("/active")
    .get(TradeController.fetchUsersActiveTrades)

router.route('/enterPosition')
    .post(TradeController.createTradeRecord)


router.route('/exitPosition')
    .post(TradeController.exitTradeRecord)

router.route("/journal")
    .get(TradeController.fetchUsersTradeJournal)
module.exports = router;
