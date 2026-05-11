# 🫀 Smart Healthcare IoT Monitoring System

A full-stack, real-time IoT health monitoring platform built as a Final Year Project. It collects vital signs — **Heart Rate, SpO₂, Body Temperature, and Air Quality (AQI)** — from an ESP32 microcontroller and streams them live to a web dashboard using WebSockets.

**Live Demo:** [final-year-iot.vercel.app](https://final-year-iot.vercel.app)

---

## 📸 Features

| Feature | Description |
|---|---|
| 🔴 **Real-time Monitoring** | Live vital sign updates via Socket.IO (no page refresh needed) |
| 👤 **User Dashboard** | Displays HR, SpO₂, Temp, AQI with trend charts and a health score ring |
| 🛡️ **Admin Panel** | Card-based view of all users with health status, click-through to full data history |
| 🔒 **JWT Authentication** | Secure login/signup with role-based access (user / admin) |
| 📊 **FIFO Queue (max 50)** | Oldest sensor data auto-trimmed when limit is reached |
| 🌙 **Dark / Light Mode** | Persisted theme toggle across all pages |
| 📱 **Responsive Design** | Works on mobile, tablet, and desktop |
| 🔍 **Admin Search** | Search users by name or email in the admin panel |

---

## 🏗️ Architecture

```
┌──────────────┐      HTTP / WebSocket      ┌────────────────────┐
│   ESP32 MCU  │ ─────────────────────────▶ │  Node.js + Express │
│  (Sensors)   │                            │  + Socket.IO       │
└──────────────┘                            │  (Render)          │
                                            └────────┬───────────┘
                                                     │ MongoDB Atlas
                                            ┌────────▼───────────┐
                                            │   React + Vite     │
                                            │   (Vercel)         │
                                            └────────────────────┘
```

---

## 🧰 Tech Stack

### Backend
| Package | Purpose |
|---|---|
| `express` | REST API server |
| `socket.io` | Real-time bidirectional communication |
| `mongoose` | MongoDB ODM |
| `jsonwebtoken` | JWT authentication |
| `bcryptjs` | Password hashing |
| `cors` | Cross-origin resource sharing |
| `dotenv` | Environment variable management |
| `nodemon` | Dev auto-restart |

### Frontend
| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `axios` | HTTP client with interceptors |
| `socket.io-client` | Real-time updates from backend |
| `recharts` | Charts (Line, Bar) |
| `framer-motion` | Page transitions & animations |
| `react-icons` | Icon library |
| `tailwindcss` | Utility-first CSS |

### Hardware
- **ESP32** microcontroller
- **MAX30102** — Heart Rate & SpO₂ sensor
- **DS18B20 / MLX90614** — Body temperature sensor
- **MQ-135** — Air Quality (AQI) sensor

---

## 📁 Project Structure

```
FINAL_YEAR/
├── Backend/
│   ├── controllers/
│   │   ├── authController.js       # Legacy auth (signup/login)
│   │   └── dataController.js       # Sensor data handlers
│   ├── middleware/
│   │   └── authMiddleware.js       # JWT protect middleware
│   ├── models/
│   │   ├── User.js                 # User schema (bcrypt pre-save hook)
│   │   └── SensorData.js          # Sensor reading schema
│   ├── routes/
│   │   └── userRoutes.js           # All API routes
│   ├── socket/
│   │   └── socketHandler.js        # Socket.IO event handlers
│   ├── utils/
│   │   └── generateToken.js        # JWT token generator
│   ├── sensorSimulator.js          # Dev tool to simulate ESP32 data
│   ├── server.js                   # App entry point
│   └── .env                        # Environment variables (not committed)
│
└── iot-health/                     # React Frontend (Vite)
    ├── src/
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── ChartCard.jsx
    │   │   ├── SkeletonCard.jsx
    │   │   └── AnimatedPageWrapper.jsx
    │   ├── context/
    │   │   └── ThemeContext.jsx     # Dark/light mode state
    │   ├── lib/
    │   │   ├── axios.js             # Axios instance + 401 interceptor
    │   │   └── socket.js            # Socket.IO client singleton
    │   ├── pages/
    │   │   ├── LoginSignup.jsx
    │   │   ├── Dashboard.jsx        # User health dashboard
    │   │   └── AdminPanel.jsx       # Admin user management
    │   └── App.jsx                  # Routes + auth guards
    ├── vercel.json                  # SPA routing fix for Vercel
    └── .env                        # VITE_API_URL (not committed)
```

---

## ⚙️ Local Setup

### Prerequisites
- Node.js ≥ 18
- MongoDB Atlas account (or local MongoDB)
- Git

---

### 1. Clone the repository

```bash
git clone https://github.com/your-username/FINAL_YEAR.git
cd FINAL_YEAR
```

---

### 2. Backend Setup

```bash
cd Backend
npm install
```

Create a `.env` file in the `Backend/` folder:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key
PORT=8080
CORS_ORIGIN=http://localhost:5173,https://your-vercel-app.vercel.app
```

Start the backend:

```bash
# Development (with auto-restart)
npm run server

# Production
npm start
```

---

### 3. Frontend Setup

```bash
cd iot-health
npm install
```

Create a `.env` file in the `iot-health/` folder:

```env
VITE_API_URL=http://localhost:8080/api/users
```

Start the frontend dev server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/users/signup` | ❌ | Register a new user |
| `POST` | `/api/users/login` | ❌ | Login and receive JWT |

### User
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/:id/data` | ✅ | Get current user's sensor history |

### Admin
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users/admin/users` | ✅ Admin | List all non-admin users |
| `GET` | `/api/users/admin/data` | ✅ Admin | Latest 50 sensor records (all users) |
| `GET` | `/api/users/admin/users/:id/data` | ✅ Admin | Sensor history for a specific user |

### Device
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/users/device/claim` | ✅ | Claim the ESP32 device |
| `POST` | `/api/users/device/release` | ✅ | Release the ESP32 device |
| `GET` | `/api/users/device/status` | ❌ | Check if device is claimed |
| `GET` | `/api/users/device/esp32-status` | ❌ | Check ESP32 physical connection |

### Sensor Data Ingestion (ESP32)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/users/sensor-data` | Device ID | Receive readings from ESP32 |

**Sensor data payload:**
```json
{
  "deviceId": "YOUR_ESP32_MAC_ADDRESS",
  "heartrate": 78,
  "temperature": 36.6,
  "spo2": 98,
  "touchDetected": true,
  "airQuality": 42
}
```

---

## 🌐 Deployment

### Backend → [Render](https://render.com)
1. Push `Backend/` to GitHub
2. Create a **Web Service** on Render pointing to `Backend/`
3. Set build command: `npm install`
4. Set start command: `node server.js`
5. Add all environment variables from `.env` in the **Environment** tab
6. Update `CORS_ORIGIN` to include your Vercel frontend URL

### Frontend → [Vercel](https://vercel.com)
1. Push `iot-health/` to GitHub (or the whole repo)
2. Import the project on Vercel, set **Root Directory** to `iot-health`
3. Add environment variable:
   - `VITE_API_URL` = `https://your-render-backend.onrender.com/api/users`
4. Vercel will auto-deploy on every push

> **Note:** The `vercel.json` file at `iot-health/vercel.json` rewrites all routes to `index.html` to support React Router's client-side navigation.

---

## 🔐 Environment Variables

### Backend (`Backend/.env`)
| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `PORT` | Server port (default: `8080`) |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins |

### Frontend (`iot-health/.env`)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Full backend base URL including `/api/users` |

---

## 👤 Default Roles

| Role | Access |
|---|---|
| `user` | Dashboard — view own vitals, claim/release device |
| `admin` | Admin Panel — view all users, their health status and full data history |

> To create an admin account, register normally then manually update `role` to `"admin"` in MongoDB Atlas.

---

## 📡 Real-time Events (Socket.IO)

| Event | Direction | Payload |
|---|---|---|
| `sensor:update` | Server → Client | Latest `SensorData` record (populated with user name) |
| `device:status` | Server → Client | `{ connected: boolean }` — ESP32 connection state |

---

## 🩺 Health Thresholds

| Vital | Warning | Critical |
|---|---|---|
| Heart Rate | > 100 bpm | > 120 bpm |
| Temperature | > 37.5 °C | > 38.3 °C |
| SpO₂ | < 94% | < 90% |

---

## 📜 License

This project is built for academic/educational purposes as a Final Year Engineering Project.

---

## 🙋 Author

**Sayan Ghosh**  
B.Tech — Electronics & Communication Engineering  
Final Year Project · 2026