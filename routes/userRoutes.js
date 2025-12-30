const express = require("express");
const router = express.Router();
const UserController = require("../controllers/UserController");
const WatchListController = require("../controllers/WatchListController");

router.route("/login/:userId")
    .get(UserController.userLoginDataFetch);

router.route("/watchlist/:userId")
    .post(WatchListController.createUserWatchList);

router.route("/watchlist/:watchListId/edit")
    .put(WatchListController.renameUserWatchList)
    .delete(WatchListController.deleteUserWatchList)

router.route("/watchlist/:watchListId/tickers")
    .post(WatchListController.addTickerToWatchList)
    .put(WatchListController.removeTickerFromWatchList);
module.exports = router;
