const express = require("express");
const router = express.Router();
const UserController = require("../controllers/UserController");
const WatchListController = require("../controllers/WatchListController");

router.route("/login/:userId")
    .get(UserController.userLoginDataFetch);

router.route("/:userId/watchlist")
    .post(WatchListController.createUserWatchList);

router.route("/watchlist/:watchListId")
    .post(WatchListController.addTickerToWatchList)
    .put(WatchListController.removeTickerFromWatchList);
module.exports = router;
