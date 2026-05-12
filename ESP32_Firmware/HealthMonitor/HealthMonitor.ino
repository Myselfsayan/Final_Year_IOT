/*
 * ============================================================
 *  Smart Healthcare IoT Monitoring System — ESP32 Firmware
 * ============================================================
 *
 *  Sensors Used:
 *    - MAX30102   : Heart Rate + SpO2 (I2C)
 *    - DS18B20    : Digital Body Temperature (1-Wire)
 *    - MQ-135     : Air Quality / AQI (Analog)
 *    - TTP223     : Capacitive Touch Sensor Module (Digital)
 *
 *  Libraries Required (install via Arduino Library Manager):
 *    - "MAX30105"          by SparkFun Electronics
 *    - "OneWire"           by Paul Stoffregen
 *    - "DallasTemperature" by Miles Burton
 *    - "ArduinoJson"       by Benoit Blanchon  (v6.x)
 *    - "HTTPClient"        built-in with ESP32 Arduino core
 *    NOTE: TTP223 needs NO library — uses digitalRead() only.
 *
 *  Wiring:
 *    MAX30102  SDA  --> GPIO 21
 *    MAX30102  SCL  --> GPIO 22
 *    MAX30102  VIN  --> 3.3V
 *    MAX30102  GND  --> GND
 *
 *    DS18B20   DATA --> GPIO 4   (with 4.7kΩ pull-up to 3.3V)
 *    DS18B20   VCC  --> 3.3V
 *    DS18B20   GND  --> GND
 *
 *    MQ-135    AOUT --> GPIO 34  (analog input, ADC1 channel)
 *    MQ-135    VCC  --> 5V
 *    MQ-135    GND  --> GND
 *
 *    TTP223    SIG  --> GPIO 27  (digital input)
 *    TTP223    VCC  --> 3.3V
 *    TTP223    GND  --> GND
 *    NOTE: Default output = HIGH when touched (Pad A open = Active High).
 *          Pad B open = Momentary mode (signal held while touching).
 *
 * ============================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>

// MAX30102 — HR & SpO2
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include "heartRate.h"

// DS18B20 — 1-Wire Temperature
#include <OneWire.h>
#include <DallasTemperature.h>

// ── USER CONFIGURATION ────────────────────────────────────────────────────────

const char* WIFI_SSID     = "ID";
const char* WIFI_PASSWORD = "PASSWORD";

// Your Render backend URL
const char* SERVER_URL      = "URL";
const char* STATUS_URL      = "URL1";
const char* LIVE_STATUS_URL = "URL2";

// Must match the deviceId hardcoded in userRoutes.js on the backend
// Change this to your ESP32's MAC address if needed
const char* DEVICE_ID     = "YOUR_ESP32_MAC_ADDRESS";

// How often to send data (milliseconds).
// Set to 8000 so exactly ONE reading is sent within the 12-second
// monitoring session — giving sensors enough warm-up time first.
const unsigned long SEND_INTERVAL        = 8000;

// How often to send live status (touch + finger) regardless of claim state
const unsigned long LIVE_STATUS_INTERVAL = 2000;

// MQ-135 analog pin (use ADC1 pins only: 32–39 on ESP32)
const int MQ135_PIN = 34;

// DS18B20 data pin (1-Wire)
const int DS18B20_PIN = 4;

// TTP223 Touch Sensor — digital output module
// SIG pin --> GPIO 27 | HIGH = touched (default Active High, Momentary mode)
const int TTP223_PIN = 27;

// ── GLOBALS ───────────────────────────────────────────────────────────────────

MAX30105 particleSensor;
OneWire           oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);

// HR algorithm buffers (must be 100 samples)
const byte    RATE_SIZE = 4;
byte          rates[RATE_SIZE];
byte          rateSpot  = 0;
long          lastBeat  = 0;
float         beatsPerMinute;
int           beatAvg   = 0;

// SpO2 algorithm buffers
uint32_t irBuffer[100];
uint32_t redBuffer[100];
int32_t  spo2Value    = 0;
int8_t   validSPO2    = 0;
int32_t  heartRateMA  = 0;
int8_t   validHR      = 0;

bool     fingerDetected = false;   // MAX30102 optical finger detection
bool     touchActive    = false;   // TTP223 touch sensor state
unsigned long lastSend       = 0;
unsigned long lastLiveStatus = 0;
unsigned long bootTime       = 0;  // for MQ-135 warm-up tracking

// ── SETUP ─────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("  Smart Healthcare IoT System - ESP32  ");
  Serial.println("========================================");

  // ── I2C Init ──────────────────────────────────────────────────────────────
  Wire.begin(21, 22);  // SDA, SCL

  // ── MAX30102 Init ──────────────────────────────────────────────────────────
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[ERROR] MAX30102 not found! Check wiring.");
    while (1) { delay(500); }
  }
  // Setup for SpO2 mode: ledBrightness=60 (~1.2mA, needed for SpO2 accuracy),
  // sampleAverage=4, ledMode=2 (RED+IR both on), sampleRate=100,
  // pulseWidth=411 (18-bit ADC), adcRange=4096
  particleSensor.setup(60, 4, 2, 100, 411, 4096);
  Serial.println("[OK] MAX30102 initialized.");

  // ── DS18B20 Init ──────────────────────────────────────────────────────────
  ds18b20.begin();
  if (ds18b20.getDeviceCount() == 0) {
    Serial.println("[ERROR] DS18B20 not found! Check wiring & pull-up resistor.");
    while (1) { delay(500); }
  }
  ds18b20.setResolution(12);  // 12-bit resolution (~0.0625°C)
  Serial.println("[OK] DS18B20 initialized. Sensors found: " + String(ds18b20.getDeviceCount()));

  // ── MQ-135 ────────────────────────────────────────────────────────────────
  analogReadResolution(12);  // 0–4095 for ESP32
  Serial.println("[OK] MQ-135 ready on pin " + String(MQ135_PIN));

  // ── TTP223 Touch Sensor ───────────────────────────────────────────────
  pinMode(TTP223_PIN, INPUT);  // TTP223 has push-pull output, no pull-up needed
  Serial.println("[OK] TTP223 touch sensor ready on GPIO " + String(TTP223_PIN));

  // ── WiFi ──────────────────────────────────────────────────────────────────
  Serial.print("[WiFi] Connecting to " + String(WIFI_SSID));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());

  // ── Initial SpO2 buffer fill ───────────────────────────────────────────────
  Serial.println("[INFO] Filling SpO2 buffer (100 samples)...");
  for (byte i = 0; i < 100; i++) {
    while (!particleSensor.available()) particleSensor.check();
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i]  = particleSensor.getIR();
    particleSensor.nextSample();
  }
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, 100, redBuffer,
    &spo2Value, &validSPO2,
    &heartRateMA, &validHR
  );

  Serial.println("[READY] Starting monitoring loop...\n");
  bootTime = millis(); // start warm-up timer for MQ-135
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Check if the device is currently claimed by a user on the server
bool isDeviceClaimed() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(STATUS_URL);
  int code = http.GET();

  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<64> doc;
    deserializeJson(doc, payload);
    bool claimed = doc["isClaimed"] | false;
    http.end();
    return claimed;
  }

  http.end();
  return false;
}

// Map MQ-135 raw ADC (0–4095) to approximate AQI (0–500)
// ⚠️ MQ-135 needs ~5 minutes warm-up. Values before that may read low.
int readAQI() {
  int raw = analogRead(MQ135_PIN);
  // During warm-up (<60s), skip readings where sensor clearly isn't heated yet
  if ((millis() - bootTime) < 60000UL) return -1;
  // After warm-up, always return a value — map raw ADC to AQI scale
  // raw=0 → AQI=0 (clean air), raw=4095 → AQI=500 (hazardous)
  int aqi = map(raw, 0, 4095, 0, 500);
  return constrain(aqi, 0, 500);
}

// ── Always-on live status POST (no claim needed) ────────────────────────────
void sendLiveStatus() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<128> doc;
  doc["deviceId"]       = DEVICE_ID;
  doc["touchDetected"]  = touchActive;
  doc["fingerOnSensor"] = fingerDetected;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  http.begin(LIVE_STATUS_URL);
  http.addHeader("Content-Type", "application/json");
  http.POST(payload);   // fire-and-forget, don't need the response
  http.end();

  Serial.printf("[LIVE] Touch=%-3s | Finger=%-3s\n",
    touchActive    ? "YES" : "NO",
    fingerDetected ? "YES" : "NO"
  );
}

// ── MAIN LOOP ─────────────────────────────────────────────────────────────────

void loop() {
  // ── Continuously read MAX30102 for HR detection ───────────────────────────
  // Shift SpO2 buffer: drop oldest 25, shift remaining 75 down
  for (byte i = 25; i < 100; i++) {
    redBuffer[i - 25] = redBuffer[i];
    irBuffer[i - 25]  = irBuffer[i];
  }
  // Fill the last 25 slots with fresh samples
  for (byte i = 75; i < 100; i++) {
    while (!particleSensor.available()) particleSensor.check();
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i]  = particleSensor.getIR();

    // MAX30102 optical finger detection: IR > 50000 means finger is present
    fingerDetected = (irBuffer[i] > 50000);

    // TTP223 touch sensor: digitalRead HIGH = touched
    touchActive = (digitalRead(TTP223_PIN) == HIGH);

    // Beat detection using SparkFun's checkForBeat
    if (checkForBeat(irBuffer[i])) {
      long delta = millis() - lastBeat;
      lastBeat   = millis();
      beatsPerMinute = 60.0 / (delta / 1000.0);

      if (beatsPerMinute > 20 && beatsPerMinute < 255) {
        rates[rateSpot++ % RATE_SIZE] = (byte)beatsPerMinute;
        rateSpot %= RATE_SIZE;
        beatAvg = 0;
        for (byte x = 0; x < RATE_SIZE; x++) beatAvg += rates[x];
        beatAvg /= RATE_SIZE;
      }
    }
    particleSensor.nextSample();
  }

  // ── Recalculate SpO2 ─────────────────────────────────────────────────────
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, 100, redBuffer,
    &spo2Value, &validSPO2,
    &heartRateMA, &validHR
  );

  unsigned long now = millis();

  // ── Always-on live status every LIVE_STATUS_INTERVAL ─────────────────────
  // Sends touch + finger state to backend regardless of claim.
  // This keeps ESP32 badge green and live finger chip updated on dashboard.
  if (now - lastLiveStatus >= LIVE_STATUS_INTERVAL) {
    lastLiveStatus = now;
    sendLiveStatus();
  }

  // ── Full sensor data every SEND_INTERVAL, only when claimed ──────────────
  if (now - lastSend >= SEND_INTERVAL) {
    lastSend = now;

    if (!isDeviceClaimed()) {
      Serial.println("[STANDBY] Device not claimed. Waiting...");
      return;
    }

    // ── Read temperature (DS18B20) ────────────────────────────────────────
    ds18b20.requestTemperatures();
    float tempC = ds18b20.getTempCByIndex(0);
    if (tempC == DEVICE_DISCONNECTED_C || isnan(tempC)) tempC = 0.0;

    // ── Read AQI (returns -1 while sensor is warming up) ─────────────────
    int aqi = readAQI();

    // ── Resolve HR: beatAvg primary, heartRateMA from SpO2 algo fallback ─
    // beatAvg needs 4 beats to fill buffer (~4-6s). heartRateMA is ready sooner.
    int finalHR = 0;
    if (fingerDetected) {
      if (beatAvg > 0) {
        finalHR = beatAvg;
      } else if (validHR && heartRateMA > 20 && heartRateMA < 250) {
        finalHR = (int)heartRateMA;  // SpO2 algorithm HR fallback
      }
    }
    int finalSpo2 = (fingerDetected && validSPO2 && spo2Value > 0) ? (int)spo2Value : 0;

    // ── Build JSON payload ────────────────────────────────────────────────
    StaticJsonDocument<256> doc;
    doc["deviceId"]       = DEVICE_ID;
    doc["heartrate"]      = finalHR;
    doc["temperature"]    = round(tempC * 10) / 10.0;
    doc["spo2"]           = finalSpo2;
    doc["touchDetected"]  = touchActive;
    doc["fingerOnSensor"] = fingerDetected;
    // Send null for AQI while warming up so backend stores null, not 0
    if (aqi >= 0) doc["airQuality"] = aqi;
    else          doc["airQuality"] = nullptr;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    // ── POST to backend ───────────────────────────────────────────────────
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(SERVER_URL);
      http.addHeader("Content-Type", "application/json");

      int httpCode = http.POST(jsonPayload);

      Serial.printf("[SEND] Touch=%-3s | Finger=%-3s | HR=%3d bpm | SpO2=%3d%% | Temp=%.1f°C | AQI=%s | HTTP=%d\n",
        touchActive    ? "YES" : "NO",
        fingerDetected ? "YES" : "NO",
        finalHR, finalSpo2, tempC,
        (aqi >= 0 ? String(aqi).c_str() : "warm"),
        httpCode
      );

      if (httpCode < 0)
        Serial.println("[ERROR] HTTP POST failed: " + http.errorToString(httpCode));

      http.end();
    } else {
      Serial.println("[ERROR] WiFi disconnected. Attempting reconnect...");
      WiFi.reconnect();
    }
  }
}