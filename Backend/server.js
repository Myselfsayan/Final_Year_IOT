const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const userRoutes = require('./routes/userRoutes');
const { initSocket } = require('./socket/socketHandler');

const app = express();

// Create HTTP server so Socket.IO can share the same port
const httpServer = http.createServer(app);

// Attach Socket.IO to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Initialise socket event handlers
initSocket(io);

// Routes
app.use('/api/users', userRoutes);

const PORT = process.env.PORT || 8080;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT} with Socket.IO`));
  })
  .catch(err => console.error('Could not connect to MongoDB', err));
