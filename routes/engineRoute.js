const express = require("express");
const router = express.Router();
const EngineController = require("../controllers/EngineController");

router.route("/historical")
    .get(EngineController.fetchHistoricalEngineData);

router.route("/today/bars")
    .get(EngineController.fetchTodaysEngineData);

router.route("/today/trades")
    .get(EngineController.fetchTradeEngineData);


module.exports = router;
