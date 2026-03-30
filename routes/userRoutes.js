const express = require("express");
const router = express.Router();
const UserController = require("../controllers/UserController");
const WatchListController = require("../controllers/WatchListController");

router.route("/login")
    .get(UserController.userLoginDataFetch);

router.route("/account")
    .get(UserController.fetchAccountPL)
router.route("/account/riskThreshold")
    .get(UserController.updateAccountRiskThreshold)

router.route("/marketSearch/filter")
    .post(UserController.createUserSavedMarketFilter)
    .delete(UserController.removeUserSavedMarketFilter)

router.route("/marketSearch/record")
    .get(UserController.fetchUsersMarketSearchProgress)
    .post(UserController.recordUsersMostRecentMarketPageSearch)


router.route("/watchlist/:userId")
    .post(WatchListController.createUserWatchList);

router.route('/watchlist/macro')
    .get(UserController.fetchUserMacroWatchListsWithTickerData)
router.route('/watchlist/dailyMacroZones')
    .get(UserController.fetchUsersMacroSectorDailyZones)

router.route("/watchlist/:watchListId/edit")
    .put(WatchListController.renameUserWatchList)
    .delete(WatchListController.deleteUserWatchList)

router.route("/watchlist/:watchListId/tickers")
    .post(WatchListController.addTickerToWatchList)
    .put(WatchListController.removeTickerFromWatchList);

router.route("/enterExitPlans")
    .get(UserController.fetchUserEnterExitPlans)
router.route('/enterExitPlans/tiny')
    .get(UserController.fetchUsersTinyEnterExitPlans)

router.route('/reset')
    .get(UserController.resetUser)

module.exports = router;
