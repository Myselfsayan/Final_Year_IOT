import express from "express";
import User from "../models/User.js";
import SensorData from "../models/SensorData.js";
import { protect } from "../middleware/authMiddleware.js";
import generateToken from "../utils/generateToken.js";

import {
  broadcastSensorData,
  broadcastLiveStatus,
  getEsp32Status,
  setEsp32Online,
  setEsp32Offline,
} from "../socket/socketHandler.js";

const router = express.Router();

// --- Queue Configuration ---
const QUEUE_MAX = 50;      // Max records stored per user
const QUEUE_TRIM_TO = 30;  // Trim back to this count when limit is hit (removes oldest 20)

// In-memory device claim state (unchanged from original)
let activeDevice = {
  deviceId: 'YOUR_ESP32_MAC_ADDRESS',
  userId: null,
  timeoutId: null,
};

// ─── Auth Routes ──────────────────────────────────────────────────────────────

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const user = await User.create({ name, email, password });
    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('[signup] Error:', error);
    res.status(500).json({ message: error.message || 'Server error during signup' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && (await user.matchPassword(password))) {
      res.json({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('[login] Error:', error);
    res.status(500).json({ message: error.message || 'Server error during login' });
  }
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// @desc    Get list of all non-admin users (for admin panel sidebar)
// @route   GET /api/users/admin/users
// @access  Private/Admin
router.get('/admin/users', protect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: Admins only' });
  }
  try {
    const users = await User.find({ role: 'user' }).select('name email createdAt');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @desc    Get all sensor data (latest 50) for admin overview table
// @route   GET /api/users/admin/data
// @access  Private/Admin
router.get('/admin/data', protect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: User is not an admin' });
  }
  try {
    const latestData = await SensorData.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'name');
    res.json(latestData);
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @desc    Get sensor history for a specific user (admin click-through)
// @route   GET /api/users/admin/users/:userId/data
// @access  Private/Admin
router.get('/admin/users/:userId/data', protect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: Admins only' });
  }
  try {
    const sensorData = await SensorData.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(sensorData);
  } catch (error) {
    console.error('Error fetching user sensor data:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// ─── User Data Route ──────────────────────────────────────────────────────────

// @desc    Get current user's sensor data
// @route   GET /api/users/:id/data
// @access  Private
router.get('/:id/data', protect, async (req, res) => {
  try {
    const sensorData = await SensorData.find({ userId: req.params.id }).sort({ createdAt: -1 });
    res.json(sensorData);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// ─── Device Routes ────────────────────────────────────────────────────────────

// Device Claim
router.post('/device/claim', protect, (req, res) => {
  const userId = req.user._id;
  if (activeDevice.userId === null) {
    activeDevice.userId = userId;
    activeDevice.timeoutId = setTimeout(() => {
      activeDevice.userId = null;
      activeDevice.timeoutId = null;
    }, 12000); // 12s: gives ESP32 time to send its single 8s reading before session ends
    res.status(200).json({ message: 'Device claimed successfully.' });
  } else {
    res.status(409).json({ message: 'Device is currently in use.' });
  }
});

// Device Release
router.post('/device/release', protect, (req, res) => {
  const userId = req.user._id;
  if (activeDevice.userId && activeDevice.userId.equals(userId)) {
    clearTimeout(activeDevice.timeoutId);
    activeDevice.userId = null;
    activeDevice.timeoutId = null;
    res.status(200).json({ message: 'Device released successfully.' });
  } else {
    res.status(400).json({ message: 'You do not have a claim on this device.' });
  }
});

// Device Claim Status
router.get('/device/status', (req, res) => {
  res.status(200).json({ isClaimed: activeDevice.userId !== null });
});

// ESP32 Physical Connection Status
router.get('/device/esp32-status', (req, res) => {
  res.status(200).json({ connected: getEsp32Status() });
});

// ─── ESP32 Always-On Live Status ──────────────────────────────────────────────
// Called every 2s by the ESP32 regardless of claim state.
// Refreshes the heartbeat (marks ESP32 online) and broadcasts touch/finger
// state to all connected dashboard browsers WITHOUT saving to the database.
router.post('/device/live-status', (req, res) => {
  const { deviceId, touchDetected, fingerOnSensor } = req.body;

  if (deviceId === activeDevice.deviceId) {
    // Refresh heartbeat — this keeps the ESP32 badge green
    refreshEsp32Heartbeat();
    // Broadcast real-time touch + finger state to all browsers
    broadcastLiveStatus({
      touchDetected:  touchDetected  || false,
      fingerOnSensor: fingerOnSensor || false,
    });
  }

  res.status(200).send('OK');
});

// ─── Sensor Data Ingestion ────────────────────────────────────────────────────

// @desc    Receive sensor data from ESP32 / simulator
// @route   POST /api/users/sensor-data
// @access  Public (device authenticates via deviceId)
// ── ESP32 Heartbeat Tracker ───────────────────────────────────────────────────
// The ESP32 uses plain HTTP (no Socket.IO client), so we detect its
// online/offline state by watching for incoming POST requests.
// If no POST arrives within ESP32_TIMEOUT_MS, we broadcast offline.
const ESP32_TIMEOUT_MS = 4000; // 1.8× the 8-second send interval — marks offline only after genuine inactivity
let esp32HeartbeatTimer = null;

function refreshEsp32Heartbeat() {
  // Mark online and notify all browsers
  setEsp32Online();
  // Reset the inactivity timer
  if (esp32HeartbeatTimer) clearTimeout(esp32HeartbeatTimer);
  esp32HeartbeatTimer = setTimeout(() => {
    setEsp32Offline();
    console.log('[ESP32] No data received — marking OFFLINE');
  }, ESP32_TIMEOUT_MS);
}

// ─── Sensor Data Ingestion ────────────────────────────────────────────────────

// @desc    Receive sensor data from ESP32 / simulator
// @route   POST /api/users/sensor-data
// @access  Public (device authenticates via deviceId)
router.post('/sensor-data', async (req, res) => {
  const {
    deviceId,
    heartrate,
    temperature,
    spo2,
    touchDetected,    // TTP223 capacitive touch pad — user touched the pad
    fingerOnSensor,   // MAX30102 optical — finger placed on HR/SpO2 sensor
    airQuality
  } = req.body;

  // ── Always refresh ESP32 heartbeat on any valid POST ─────────────────────
  if (deviceId === activeDevice.deviceId) {
    refreshEsp32Heartbeat();
  }

  if (activeDevice.userId && deviceId === activeDevice.deviceId) {
    try {
      // ── Queue Logic ──────────────────────────────────────────────────────
      // Enforce max QUEUE_MAX records per user using FIFO strategy.
      // When limit is reached, trim oldest records back to QUEUE_TRIM_TO.
      const count = await SensorData.countDocuments({ userId: activeDevice.userId });
      if (count >= QUEUE_MAX) {
        const excess = count - QUEUE_TRIM_TO + 1;
        const oldest = await SensorData.find({ userId: activeDevice.userId })
          .sort({ createdAt: 1 })
          .limit(excess)
          .select('_id');
        await SensorData.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
        console.log(`[Queue] Trimmed ${excess} oldest record(s) for user ${activeDevice.userId}`);
      }
      // ─────────────────────────────────────────────────────────────────────

      // Gate HR & SpO2 on MAX30102 finger detection (fingerOnSensor).
      // touchDetected is the TTP223 pad — separate from the optical sensor.
      // Fall back to touchDetected for older firmware that doesn't send fingerOnSensor.
      const fingerPresent = (fingerOnSensor !== undefined) ? fingerOnSensor : touchDetected;

      const newRecord = await SensorData.create({
        userId:         activeDevice.userId,
        heartrate:      fingerPresent ? heartrate : 0,
        temperature,
        spo2:           fingerPresent ? spo2 : 0,
        touchDetected:  touchDetected  || false,
        fingerOnSensor: fingerPresent  || false,
        airQuality:     airQuality !== undefined ? airQuality : null,
      });

      // Populate userId.name before broadcasting
      const populated = await SensorData.findById(newRecord._id).populate('userId', 'name');
      broadcastSensorData(populated);

      res.status(201).send('Data received.');
    } catch (error) {
      console.error('[sensor-data] Error:', error);
      res.status(500).send('Error saving data.');
    }
  } else {
    res.status(202).send('Data ignored.');
  }
});

export default router;
