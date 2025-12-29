const express = require("express");
const router = express.Router();
const ChartingController = require("../controllers/ChartingController");

router.route("/:chartId").get(ChartingController.fetchChartingData);

module.exports = router;
