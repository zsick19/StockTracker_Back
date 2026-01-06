const express = require("express");
const router = express.Router();
const PatternController = require("../controllers/PatternController");

router.route("/found")
    .get(PatternController.addPatternedStockToUser);

module.exports = router;
