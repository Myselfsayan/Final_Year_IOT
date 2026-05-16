let _io = null;
let esp32Connected = false;

/**
 * Initializes the Socket.IO server handler.
 * Must be called once from server.js after creating the io instance.
 */
const initSocket = (io) => {
  _io = io;

  io.on('connection', (socket) => {
    console.log(`[Socket] Browser client connected: ${socket.id}`);

    // Immediately send current ESP32 status to the newly connected browser
    socket.emit('device:status', { connected: esp32Connected });

    socket.on('disconnect', () => {
      console.log(`[Socket] Browser client disconnected: ${socket.id}`);
    });
  });
};

/**
 * Broadcasts new sensor data to all connected browser clients.
 * Called from userRoutes after a successful DB write.
 */
const broadcastSensorData = (data) => {
  if (_io) _io.emit('sensor:update', data);
};

/**
 * Mark ESP32 as ONLINE and notify all browser clients.
 * Called from the HTTP POST heartbeat in userRoutes.
 */
const setEsp32Online = () => {
  if (!esp32Connected) {
    esp32Connected = true;
    if (_io) _io.emit('device:status', { connected: true });
    console.log('[ESP32] Heartbeat received — marking ONLINE');
  }
};

/**
 * Mark ESP32 as OFFLINE and notify all browser clients.
 * Called when the heartbeat timeout fires in userRoutes.
 */
const setEsp32Offline = () => {
  if (esp32Connected) {
    esp32Connected = false;
    if (_io) _io.emit('device:status', { connected: false });
    console.log('[ESP32] Heartbeat timeout — marking OFFLINE');
  }
};

/**
 * Broadcasts live sensor status (touch + finger) to all browser clients.
 * Called every 2s from the /device/live-status route — NOT saved to DB.
 */
const broadcastLiveStatus = (status) => {
  if (_io) _io.emit('live:status', status);
};

const getEsp32Status = () => esp32Connected;

export {
  initSocket,
  broadcastSensorData,
  broadcastLiveStatus,
  getEsp32Status,
  setEsp32Online,
  setEsp32Offline,
};
