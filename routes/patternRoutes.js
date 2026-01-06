const express = require("express");
const router = express.Router();
const PatternController = require("../controllers/PatternController");

router.route("/found")
    .get(PatternController.addPatternedStockToUser)

router.route("/unconfirmed")
    .get(PatternController.fetchUsersUnconfirmedPatterns)

router.route("/found/:historyId")
    .delete(PatternController.removePatternedStockFromUser)


module.exports = router;
