const express = require("express");
const router = express.Router();
const StockDataController = require("../controllers/StockDataController");

router.route("/ticker/:ticker")
    .post(StockDataController.stockDataFetchWithLiveFeed)

router.route('/marketSearch')
    .post(StockDataController.fetchMarketSearchStockData)

module.exports = router;
