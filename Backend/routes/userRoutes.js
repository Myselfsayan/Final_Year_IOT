const express = require('express');
const User = require('../models/User.js');
const SensorData = require('../models/SensorData.js');
const { protect } = require('../middleware/authMiddleware.js');
const generateToken = require('../utils/generateToken.js');
const { broadcastSensorData, getEsp32Status } = require('../socket/socketHandler.js');

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
});

// Login
router.post('/login', async (req, res) => {
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
    }, 10000);
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

// ─── Sensor Data Ingestion ────────────────────────────────────────────────────

// @desc    Receive sensor data from ESP32 / simulator
// @route   POST /api/users/sensor-data
// @access  Public (device authenticates via deviceId)
router.post('/sensor-data', async (req, res) => {
  const { deviceId, heartrate, temperature, spo2, touchDetected, airQuality } = req.body;

  if (activeDevice.userId && deviceId === activeDevice.deviceId) {
    try {
      // ── Queue Logic ──────────────────────────────────────────────────────
      // Enforce max QUEUE_MAX records per user using FIFO strategy.
      // When limit is reached, trim oldest records back to QUEUE_TRIM_TO.
      const count = await SensorData.countDocuments({ userId: activeDevice.userId });
      if (count >= QUEUE_MAX) {
        const excess = count - QUEUE_TRIM_TO + 1; // +1 to make room for new record
        const oldest = await SensorData.find({ userId: activeDevice.userId })
          .sort({ createdAt: 1 })
          .limit(excess)
          .select('_id');
        await SensorData.deleteMany({ _id: { $in: oldest.map(d => d._id) } });
        console.log(`[Queue] Trimmed ${excess} oldest record(s) for user ${activeDevice.userId}`);
      }
      // ─────────────────────────────────────────────────────────────────────

      // Only store HR and SpO2 when finger is actually detected
      const newRecord = await SensorData.create({
        userId: activeDevice.userId,
        heartrate: touchDetected ? heartrate : 0,
        temperature,
        spo2: touchDetected ? spo2 : 0,
        touchDetected: touchDetected || false,
        airQuality: airQuality !== undefined ? airQuality : null,
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

module.exports = router;
