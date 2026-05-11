let _broadcastFn = null;
let esp32Connected = false;

/**
 * Initializes the Socket.IO server handler.
 * Must be called once from server.js after creating the io instance.
 */
const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket] Browser client connected: ${socket.id}`);

    // Immediately send current ESP32 status to the newly connected browser
    socket.emit('device:status', { connected: esp32Connected });

    // ESP32 hardware reports its connection via these events
    socket.on('esp32:connect', () => {
      esp32Connected = true;
      io.emit('device:status', { connected: true });
      console.log('[Socket] ESP32 reported: CONNECTED');
    });

    socket.on('esp32:disconnect', () => {
      esp32Connected = false;
      io.emit('device:status', { connected: false });
      console.log('[Socket] ESP32 reported: DISCONNECTED');
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Browser client disconnected: ${socket.id}`);
    });
  });

  // Store broadcast function for use by routes
  _broadcastFn = (data) => {
    io.emit('sensor:update', data);
  };
};

/**
 * Broadcasts new sensor data to all connected browser clients.
 * Called from userRoutes after a successful DB write.
 */
const broadcastSensorData = (data) => {
  if (_broadcastFn) {
    _broadcastFn(data);
  }
};

const getEsp32Status = () => esp32Connected;

module.exports = { initSocket, broadcastSensorData, getEsp32Status };
