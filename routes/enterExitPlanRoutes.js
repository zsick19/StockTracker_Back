const express = require("express");
const router = express.Router();
const PatternController = require("../controllers/PatternController");
const UserController = require('../controllers/UserController')
const EnterExitPlanController = require('../controllers/EnterExitPlanController')


router.route("/initiate/:chartId")
    .post(EnterExitPlanController.initiateEnterExitPlan)

router.route("/update/:enterExitId")
    .put(EnterExitPlanController.updateEnterExitPlan)

module.exports = router;
