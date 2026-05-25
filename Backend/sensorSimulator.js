import axios from 'axios';

// --- Configuration ---
const SERVER_URL = process.env.BACKEND_URL ;
const DEVICE_ID = 'YOUR_ESP32_MAC_ADDRESS'; // IMPORTANT: Must match deviceId in userRoutes.js
const SEND_INTERVAL = 2000; // Send data every 2 seconds

const STATUS_CHECK_URL = `${SERVER_URL}/device/status`;

// Helper function to get a formatted IST timestamp
const getISTTimestamp = () => {
  const now = new Date();
  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  return new Intl.DateTimeFormat('en-CA', options).format(now).replace(',', '');
};

// Function to check if the device is currently claimed
const checkDeviceStatus = async () => {
  try {
    const response = await axios.get(STATUS_CHECK_URL);
    return response.data.isClaimed;
  } catch (error) {
    return false;
  }
};

// Function to generate and send sensor data
const sendSensorData = async () => {
  const isClaimed = await checkDeviceStatus();

  if (isClaimed) {
    // Simulate touch sensor — 70% chance finger is detected
    const touchDetected = Math.random() > 0.3;

    const data = {
      deviceId: DEVICE_ID,
      temperature: parseFloat((36.0 + Math.random() * 2).toFixed(1)), // 36.0 – 38.0 °C

      // HR and SpO2 only meaningful when touch is detected
      heartrate: touchDetected ? Math.floor(Math.random() * (95 - 60 + 1)) + 60 : 0,
      spo2: touchDetected ? Math.floor(Math.random() * (99 - 94 + 1)) + 94 : 0,

      // Touch sensor status
      touchDetected,

      // Air Quality Index (AQI): 0–50 Good, 51–100 Moderate, 101–150 Unhealthy for Sensitive
      airQuality: Math.floor(Math.random() * 160) + 10,
    };

    try {
      console.log(
        `[${getISTTimestamp()}] SIMULATOR: Device claimed. Touch=${touchDetected ? 'YES' : 'NO'} | AQI=${data.airQuality} | HR=${data.heartrate} | SpO2=${data.spo2} | Temp=${data.temperature}`
      );
      await axios.post(`${SERVER_URL}/sensor-data`, data);
    } catch (error) {
      console.error(
        `[${getISTTimestamp()}] SIMULATOR: Error sending data:`,
        error.response ? error.response.data : 'Server not responding'
      );
    }
  } else {
    console.log(`[${getISTTimestamp()}] SIMULATOR: Device is free. Standing by...`);
  }
};

// --- Main ---
console.log('--- Smart IoT Sensor Simulator Started ---');
console.log(`Targeting server: ${SERVER_URL}`);
console.log(`Polling every ${SEND_INTERVAL / 1000}s | Touch simulation: ON | Air Quality: ON`);
console.log('------------------------------------------');

setInterval(sendSensorData, SEND_INTERVAL);
