import bodyParser from 'body-parser';
import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import cron from "node-cron";

import swapRouter from './routes/swapRoutes';
import taprootRouter from './routes/taprootRoutes';
import airdropRouter from './routes/airdropRoutes';
import userRouter from './routes/userRoutes';
import testRouter from './routes/testRoutes';

import { connectMongoDB } from './utils/db';
import { MongoDBUrl } from './config/config';
import { checkTxStatus } from './controller/airdropController';

const PORT = process.env.PORT || 5001;

// Connect to the MongoDB database
connectMongoDB(MongoDBUrl as string);

// Create an instance of the Express application
const app = express();

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, "./public")));

// Parse incoming JSON requests using body-parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

const server = http.createServer(app);

// Set Global Variable Iterator for Wallet management
app.locals.walletIndex = 0;

// Set Global Variable Iterator for unisat api distribution
app.locals.iterator = 0;

// Set up Cross-Origin Resource Sharing (CORS) options
app.use(cors())

app.use('/api/swap', swapRouter);
app.use('/api/taproot', taprootRouter);
app.use('/api/airdrop', airdropRouter);
app.use('/api/user', userRouter);
app.use('/api/test', testRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

cron.schedule("*/10 * * * *", async () => {
  console.log("running a task every 10 minute");
  await checkTxStatus();
});

export default app;