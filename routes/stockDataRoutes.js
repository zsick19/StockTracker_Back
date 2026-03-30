const express = require("express");
const router = express.Router();
const StockDataController = require("../controllers/StockDataController");

router.route("/ticker/:ticker")
    .post(StockDataController.stockDataFetchWithLiveFeed)

router.route('/atr/:ticker')
    .get(StockDataController.calculate14DayATR)


router.route("/tickerGroup")
    .post(StockDataController.fetchGroupedStockData)

router.route('/marketSearch')
    .post(StockDataController.fetchMarketSearchStockData)

router.route('/watchlist')
    .post(StockDataController.fetchGroupTinyCharts)

module.exports = router;
