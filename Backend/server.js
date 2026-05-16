import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import userRoutes from "./routes/userRoutes.js";
import { initSocket } from "./socket/socketHandler.js";

dotenv.config();

const app = express();

// Create HTTP server so Socket.IO can share the same port
const httpServer = http.createServer(app);

// Support multiple allowed origins via comma-separated CORS_ORIGIN env var
// e.g. CORS_ORIGIN="https://your-app.vercel.app,https://final-year-iot.onrender.com"
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['*'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman) or matched origins
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin} is not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

// Attach Socket.IO to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors(corsOptions));
app.use(express.json());

// Initialise socket event handlers
initSocket(io);

// Routes
app.use('/api/users', userRoutes);

app.get("/", (req, res) => {
  res.send("Backend is running successfully");
});

app.get("/api", (req, res) => {
  res.send("API is working");
});

const PORT = process.env.PORT || 8080;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT} with Socket.IO`));
  })
  .catch(err => console.error('Could not connect to MongoDB', err));
