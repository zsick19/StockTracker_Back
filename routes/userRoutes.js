const express = require("express");
const router = express.Router();
const UserController = require("../controllers/UserController");
const WatchListController = require("../controllers/WatchListController");

router.route("/login")
    .get(UserController.userLoginDataFetch);

router.route("/marketSearch/filter")
    .post(UserController.createUserSavedMarketFilter)
    .delete(UserController.removeUserSavedMarketFilter)


router.route("/watchlist/:userId")
    .post(WatchListController.createUserWatchList);

router.route('/watchlist/macro')
    .get(UserController.fetchUserMacroWatchListsWithTickerData)

router.route("/watchlist/:watchListId/edit")
    .put(WatchListController.renameUserWatchList)
    .delete(WatchListController.deleteUserWatchList)

router.route("/watchlist/:watchListId/tickers")
    .post(WatchListController.addTickerToWatchList)
    .put(WatchListController.removeTickerFromWatchList);
module.exports = router;
