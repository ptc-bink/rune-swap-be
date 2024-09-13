import bodyParser from 'body-parser';
import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';

import swapRouter from './routes/swapRoutes';
import taprootRouter from './routes/taprootRoutes';
import { connectMongoDB } from './config/db';

const PORT = process.env.PORT || 5001;
const MongoDBUrl = process.env.MONGDB_URL;

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

// Set up Cross-Origin Resource Sharing (CORS) options
app.use(cors())

app.use('/api/swap', swapRouter);
app.use('/api/taproot', taprootRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
