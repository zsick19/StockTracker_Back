const express = require("express");
const router = express.Router();
const TradeController = require('../controllers/TradeController')
const UserController = require("../controllers/UserController");
const WatchListController = require("../controllers/WatchListController");
const UtilityContoller = require('../controllers/UtilityController')

router.route("/dailyStockDataUpload")
    .get(UtilityContoller.uploadStockCSVFile)