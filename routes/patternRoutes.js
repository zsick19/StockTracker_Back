const express = require("express");
const router = express.Router();
const PatternController = require("../controllers/PatternController");
const UserController = require('../controllers/UserController')

router.route("/found")
    .get(PatternController.addPatternedStockToUser)

router.route("/unconfirmed")
    .get(PatternController.fetchUsersUnconfirmedPatterns)

router.route("/unconfirmed/sync")
    .patch(PatternController.syncConfirmRemovePatterns)

router.route("/confirmed")
    .get(UserController.fetchUsersConfirmedPatterns)

router.route("/directConfirmed")
    .get(PatternController.addConfirmedTickerDirectlyToUser)
router.route("/found/:historyId")
    .delete(PatternController.removePatternedStockFromUser)


module.exports = router;
