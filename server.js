require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const errorHandler = require("./middleware/errorHandler");
const connectDB = require("./config/dbConnection");
const corsConfigure = require("./config/corsConfig");
const { logger, logEvents } = require("./middleware/logger");
const authenticateToken = require("./middleware/authenticateToken");
const amqp = require('amqplib');
const { rabbitQueueNames } = require("./config/rabbitMQService");

const PORT = process.env.PORT || 3500;

const initiateTrackingQueueName = 'TickerUserTracking_initiateQueue'
const updateTrackingQueueName = 'TickerUserTracking_updateQueue'

let rabbitConnection = undefined
let rabbitChannel = undefined



connectDB();
app.use(logger);
app.use(cors(corsConfigure));

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

connectToRabbitMQ()

app.use("/", express.static(path.join(__dirname, "/public")));

app.use("/", require("./routes/root")); //for first test
app.use("/auth", require("./routes/authRoutes"));

app.use(authenticateToken)
app.use("/user", require("./routes/userRoutes"));
app.use("/stockData", require("./routes/stockDataRoutes"));
app.use("/chartingData", require("./routes/chartingDataRoutes"));
app.use("/patterns", require("./routes/patternRoutes"));
app.use("/enterExitPlan", require("./routes/enterExitPlanRoutes"))
app.use("/trades", require("./routes/tradeRoutes"))

app.all("/*catch", (req, res) =>
{
  res.status(404);
  if (req.accepts("html"))
  {
    res.sendFile(path.join(__dirname, "views", "404.html"));
  } else if (req.accepts("json"))
  {
    res.json({ message: "404 Not Found" });
  } else
  {
    res.type("txt").send("404 Not Found");
  }
});

app.use(errorHandler);

mongoose.connection.once("open", () =>
{
  console.log("Connected to MongoDB");
  app.listen(PORT, () => console.log(`Server running on port ${PORT}.`));
});

mongoose.connection.on("error", (err) =>
{
  console.log(err);

  logEvents(
    `${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`,
    "mongoErrLog.log"
  );
});


async function connectToRabbitMQ()
{
  try
  {
    rabbitConnection = await amqp.connect('amqp://127.0.0.1')
    rabbitChannel = await rabbitConnection.createChannel()
    await rabbitChannel.assertQueue(initiateTrackingQueueName, { durable: true })
    await rabbitChannel.assertQueue(updateTrackingQueueName, { durable: true })
    await rabbitChannel.assertQueue(rabbitQueueNames.singleGraphTickerQueue, { durable: true })
    console.log('Producer connected To RabbitMQ')

    app.locals.channel = rabbitChannel
  } catch (error)
  {
    console.log('Error connecting to RabbitMQ', error)
  }
}
