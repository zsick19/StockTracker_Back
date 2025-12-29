const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  macroWatchLists: [{ type: mongoose.Schema.Types.ObjectId, ref: "WatchList" }],
});

module.exports = mongoose.model("User", userSchema);
