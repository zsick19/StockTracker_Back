const express = require("express");
const router = express.Router();
const EngineController = require("../controllers/EngineController");

router.route("/historical")
    .get(EngineController.fetchHistoricalEngineData);

router.route("/today/bars/openingSession")
    .get(EngineController.fetchTodaysOpenEngineData);

router.route("/today/bars/regularSession")
    .get(EngineController.fetchTodaysRegularEngineData);

router.route("/today/bars/regularSession/minute")
    .get(EngineController.fetchTodaysRegularOneMinEngineData)

router.route("/today/trades")
    .get(EngineController.fetchTradeEngineData);


module.exports = router;
