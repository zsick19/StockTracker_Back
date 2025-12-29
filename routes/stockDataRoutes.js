const express = require("express");
const router = express.Router();
const StockDataController = require("../controllers/StockDataController");

router.route("/:ticker").post(StockDataController.stockDataFetchWithLiveFeed);

module.exports = router;
