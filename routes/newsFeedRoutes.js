const express = require("express");
const router = express.Router();
const NewsFeedController = require('../controllers/NewsFeedController')

router.route("/macro")
    .get(NewsFeedController.fetchMajorMacroNews)

router.route('/activeTrades')
    .get(NewsFeedController.fetchUsersActiveTradeNews)
module.exports = router;
