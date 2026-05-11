import { useState, useEffect, useRef } from 'react';
import api from '../lib/axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ResponsiveContainer
} from 'recharts';
import Navbar from '../components/Navbar';
import ChartCard from '../components/ChartCard';
import AnimatedPageWrapper from '../components/AnimatedPageWrapper';
import SkeletonCard from '../components/SkeletonCard';
import { useTheme } from '../context/ThemeContext';
import socket from '../lib/socket';

// ── AQI helpers ──────────────────────────────────────────────────────────────
const getAQIInfo = (aqi) => {
  if (!aqi && aqi !== 0) return { label: 'N/A', color: 'text-gray-400' };
  if (aqi <= 50)  return { label: 'Good',                      color: 'text-green-600' };
  if (aqi <= 100) return { label: 'Moderate',                  color: 'text-yellow-500' };
  if (aqi <= 150) return { label: 'Unhealthy (Sensitive)',      color: 'text-orange-500' };
  return           { label: 'Unhealthy',                        color: 'text-red-600' };
};

// ── Health pie data builder ───────────────────────────────────────────────────
const buildPieData = (records) => {
  if (!records.length) return [];
  // Use records where HR > 0 (covers both old records and new touch-detected records)
  const touched = records.filter(d => d.heartrate > 0 && d.spo2 > 0);
  const hrNormal   = touched.filter(d => d.heartrate <= 100).length;
  const hrWarning  = touched.filter(d => d.heartrate > 100 && d.heartrate <= 120).length;
  const hrCritical = touched.filter(d => d.heartrate > 120).length;
  const spo2Normal = touched.filter(d => d.spo2 >= 95).length;
  const spo2Low    = touched.filter(d => d.spo2 < 95).length;
  return [
    { name: 'HR Normal',   value: hrNormal,   fill: '#22c55e' },
    { name: 'HR Warning',  value: hrWarning,  fill: '#eab308' },
    { name: 'HR Critical', value: hrCritical, fill: '#ef4444' },
    { name: 'SpO₂ Normal', value: spo2Normal, fill: '#3b82f6' },
    { name: 'SpO₂ Low',   value: spo2Low,    fill: '#f97316' },
  ].filter(d => d.value > 0);
};

// ── Overall Health Ring ───────────────────────────────────────────
const OverallHealthRing = ({ hrValue, spo2Value, aqiValue, isDark }) => {
  const score = (v, fn) => fn(v);
  const hrScore   = !hrValue   ? null : hrValue  >= 60 && hrValue  <= 90  ? 100 : hrValue  <= 100 ? 80 : hrValue  <= 120 ? 50 : 20;
  const spo2Score = !spo2Value ? null : spo2Value >= 97                   ? 100 : spo2Value >= 95  ? 80 : spo2Value >= 92 ? 50 : 20;
  const aqiScore  = aqiValue == null ? null : aqiValue <= 50 ? 100 : aqiValue <= 100 ? 75 : aqiValue <= 150 ? 50 : 25;

  const valid   = [hrScore, spo2Score, aqiScore].filter(s => s !== null);
  const overall = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;

  const colorOf = (s) => !s ? '#94a3b8' : s >= 80 ? '#22c55e' : s >= 60 ? '#eab308' : s >= 40 ? '#f97316' : '#ef4444';
  const labelOf = (s) => s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : s >= 40 ? 'Fair' : 'Poor';

  const ringColor = colorOf(overall);
  const ringLabel = labelOf(overall);

  // 270° ring: starts at 7:30 (rotate 135°), goes clockwise through 9→12→3 to 4:30
  const cx = 110, cy = 108, r = 86;
  const circ   = 2 * Math.PI * r;       // full circumference
  const arcLen = 0.75 * circ;           // 270° worth
  const fillLen = (overall / 100) * arcLen;

  const miniR    = 16;
  const miniCirc = 2 * Math.PI * miniR;

  const track = isDark ? '#334155' : '#e2e8f0';
  const muted = isDark ? '#94a3b8' : '#9ca3af';

  return (
    <div className="flex flex-col items-center" style={{ paddingTop: 6 }}>
      <svg viewBox="0 0 220 182" style={{ width: 220, height: 182 }}>
        {/* Outer glow */}
        <circle cx={cx} cy={cy} r={r + 12} fill="none" stroke={ringColor}
          strokeWidth="2" opacity="0.15"
          strokeDasharray={`${arcLen * 1.14} ${circ * 1.14}`}
          transform={`rotate(135 ${cx} ${cy})`} strokeLinecap="round" />

        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={track} strokeWidth="20"
          strokeDasharray={`${arcLen} ${circ}`}
          transform={`rotate(135 ${cx} ${cy})`} strokeLinecap="round" />

        {/* Progress */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={ringColor} strokeWidth="20"
          strokeDasharray={`${fillLen} ${circ}`}
          transform={`rotate(135 ${cx} ${cy})`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px ${ringColor}99)`, transition: 'stroke-dasharray 0.9s ease' }} />

        {/* Score */}
        <text x={cx} y={cy - 6}  textAnchor="middle" fontSize="46" fontWeight="bold" fill={ringColor}>{overall}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="11" fill={muted}>out of 100</text>
        <text x={cx} y={cy + 34} textAnchor="middle" fontSize="13" fontWeight="600" fill={ringColor}>{ringLabel}</text>
      </svg>

      <p className="text-xs font-semibold" style={{ color: muted, marginTop: -10 }}>Overall Health Score</p>

      {/* Mini rings */}
      <div className="flex gap-6 mt-3">
        {[{ label: 'Heart Rate', s: hrScore }, { label: 'SpO₂', s: spo2Score }, { label: 'Air Quality', s: aqiScore }].map(({ label, s }) => (
          <div key={label} className="flex flex-col items-center">
            <div className="relative flex items-center justify-center" style={{ width: 46, height: 46 }}>
              <svg viewBox="0 0 46 46" style={{ width: 46, height: 46 }}>
                <circle cx="23" cy="23" r={miniR} fill="none" stroke={track} strokeWidth="4" />
                <circle cx="23" cy="23" r={miniR} fill="none" stroke={colorOf(s)} strokeWidth="4"
                  strokeDasharray={`${s != null ? (s / 100) * miniCirc : 0} ${miniCirc}`}
                  transform="rotate(-90 23 23)" strokeLinecap="round" />
              </svg>
              <span className="absolute" style={{ fontSize: 9, fontWeight: 700, color: colorOf(s) }}>{s ?? '--'}</span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: muted }}>{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const Dashboard = ({ user, onLogout }) => {
  const [data, setData]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [message, setMessage]         = useState('');
  const [timer, setTimer]             = useState(0);
  const [esp32Connected, setEsp32Connected] = useState(false);
  const pollingIntervalRef            = useRef(null);
  const { isDark }                    = useTheme();

  const token = localStorage.getItem('token');

  // ── Dark mode helpers ─────────────────────────────────────────────────────
  const bg        = isDark ? 'bg-slate-900'  : 'bg-gray-50';
  const cardBg    = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100';
  const textPrime = isDark ? 'text-white'    : 'text-gray-800';
  const textMuted = isDark ? 'text-slate-400': 'text-gray-500';
  const gridLine  = isDark ? '#334155'       : '#e5e7eb';
  const tickColor = isDark ? '#94a3b8'       : '#6b7280';
  const ttStyle   = { backgroundColor: isDark ? '#1e293b' : '#fff', borderColor: isDark ? '#334155' : '#e5e7eb', color: isDark ? '#f1f5f9' : '#111' };

  // ── Initial data fetch ────────────────────────────────────────────────────
  const fetchData = async () => {
    if (!user?.id || !token) { setLoading(false); return; }
    try {
      const res = await api.get(`/${user.id}/data`);
      setData(res.data.slice(0, 20));
    } catch (err) {
      if (err.response?.status !== 401) console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when user returns to tab (mobile back navigation)
  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchData(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user]);

  // ── Socket.IO real-time updates ───────────────────────────────────────────
  useEffect(() => {
    socket.connect();

    socket.on('sensor:update', (newRecord) => {
      const recordUserId = newRecord.userId?._id || newRecord.userId;
      if (String(recordUserId) === String(user?.id)) {
        setData(prev => [newRecord, ...prev].slice(0, 20));
      }
    });

    socket.on('device:status', ({ connected }) => {
      setEsp32Connected(connected);
    });

    return () => {
      socket.off('sensor:update');
      socket.off('device:status');
      socket.disconnect();
    };
  }, [user]);

  useEffect(() => { fetchData(); }, [user]);

  // ── Monitoring timer countdown ────────────────────────────────────────────
  useEffect(() => {
    let timerId;
    if (isMonitoring && timer > 0) {
      timerId = setInterval(() => setTimer(t => t - 1), 1000);
    } else if (timer === 0 && isMonitoring) {
      handleStopMonitoring();
    }
    return () => clearInterval(timerId);
  }, [isMonitoring, timer]);

  // ── Device control ────────────────────────────────────────────────────────
  const handleStartMonitoring = async () => {
    setMessage('');
    try {
      await api.post('/device/claim', {});
      setIsMonitoring(true);
      setTimer(10);
      setMessage('Device claimed! Monitoring for 10 seconds.');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to claim device.');
    }
  };

  const handleStopMonitoring = async () => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    try {
      await api.post('/device/release', {});
      setMessage('Monitoring stopped. Refreshing final data...');
      setTimeout(fetchData, 1000);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to release device.');
    } finally {
      setIsMonitoring(false);
      setTimer(0);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const latestData      = data.length > 0 ? data[0] : {};
  const chartData       = data.slice().reverse();
  // Show -- only when touchDetected is explicitly false (new record, no finger).
  // Old records without the field (undefined) still show their values.
  const touchDetected = latestData.touchDetected !== false;
  // Always show last VALID reading for HR and SpO2 (last record where values > 0)
  const latestValidVitals = data.find(d => d.heartrate > 0 && d.spo2 > 0) || {};
  // Always show last valid AQI (last record where airQuality is not null)
  const latestValidAQI    = data.find(d => d.airQuality != null) || {};
  const tempInFahrenheit = latestData.temperature
    ? ((latestData.temperature * 9 / 5) + 32).toFixed(1)
    : 'N/A';
  const aqiInfo  = getAQIInfo(latestValidAQI.airQuality);
  const pieData  = buildPieData(data);

  // ── Skeleton loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <AnimatedPageWrapper>
        <Navbar user={user} onLogout={onLogout} />
        <main className={`min-h-screen ${bg}`}>
          <div className="container mx-auto px-4 py-8">
            <div className={`h-8 rounded w-48 mb-6 ${isDark ? 'skeleton-dark' : 'skeleton'}`} />
            <div className={`rounded-lg h-24 mb-8 ${isDark ? 'skeleton-dark' : 'skeleton'}`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} height="h-14" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SkeletonCard height="h-64" />
              <SkeletonCard height="h-64" />
            </div>
          </div>
        </main>
      </AnimatedPageWrapper>
    );
  }

  return (
    <AnimatedPageWrapper>
      <Navbar user={user} onLogout={onLogout} />
      <main className={`min-h-screen ${bg} transition-colors duration-300`}>
        <div className="container mx-auto px-4 py-8">

          {/* ── Page header + ESP32 badge ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h1 className={`text-3xl font-bold ${textPrime}`}>User Dashboard</h1>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${
              esp32Connected
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${esp32Connected ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
              {esp32Connected ? 'ESP32 Active' : 'ESP32 Offline'}
            </div>
          </div>

          {/* ── Device control card ── */}
          <div className={`border p-4 rounded-lg shadow-md mb-8 ${cardBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className={`text-xl font-semibold ${textPrime}`}>Device Control</h2>
              {/* Touch sensor status chip */}
              {data.length > 0 && (
                <div className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium ${
                  touchDetected
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-yellow-50 text-yellow-700'
                }`}>
                  <span>{touchDetected ? '✅' : '⚠️'}</span>
                  <span>{touchDetected ? 'Finger Detected' : 'No Finger Detected'}</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-4">
              {!isMonitoring ? (
                <button
                  id="start-monitoring-btn"
                  onClick={handleStartMonitoring}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Start Monitoring
                </button>
              ) : (
                <button
                  id="stop-monitoring-btn"
                  onClick={handleStopMonitoring}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  Stop Monitoring ({timer}s left)
                </button>
              )}
            </div>
            {message && <p className={`mt-3 text-sm font-semibold ${textMuted}`}>{message}</p>}
            {!touchDetected && data.length > 0 && (
              <p className="mt-2 text-sm text-yellow-600 flex items-center gap-1">
                ⚠️ Place your finger on the sensor to start measuring Heart Rate &amp; SpO₂.
              </p>
            )}
          </div>

          {/* ── Data sections ── */}
          {data.length > 0 ? (
            <>
              {/* Row 1 — Metric cards (now 4) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Heart Rate — always show last valid reading */}
                <div className={`card p-6 text-center ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
                  <h3 className={`text-sm mb-1 ${textMuted}`}>Heart Rate</h3>
                  <p className="text-4xl font-bold text-blue-600">
                    {latestValidVitals.heartrate || 'N/A'} <span className="text-base">bpm</span>
                  </p>
                  {!touchDetected && <p className="text-xs text-yellow-500 mt-1">Last known</p>}
                </div>

                {/* Temperature */}
                <div className={`card p-6 text-center ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
                  <h3 className={`text-sm mb-1 ${textMuted}`}>Temperature</h3>
                  <p className="text-4xl font-bold text-green-600">{tempInFahrenheit} <span className="text-base">°F</span></p>
                </div>

                {/* SpO2 — always show last valid reading */}
                <div className={`card p-6 text-center ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
                  <h3 className={`text-sm mb-1 ${textMuted}`}>SpO₂</h3>
                  <p className="text-4xl font-bold text-red-600">
                    {latestValidVitals.spo2 || 'N/A'} <span className="text-base">%</span>
                  </p>
                  {!touchDetected && <p className="text-xs text-yellow-500 mt-1">Last known</p>}
                </div>

                {/* Air Quality — always show last valid AQI */}
                <div className={`card p-6 text-center ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
                  <h3 className={`text-sm mb-1 ${textMuted}`}>Air Quality (AQI)</h3>
                  <p className={`text-4xl font-bold ${aqiInfo.color}`}>{latestValidAQI.airQuality ?? 'N/A'}</p>
                  <span className={`text-xs font-semibold mt-1 inline-block ${aqiInfo.color}`}>{aqiInfo.label}</span>
                </div>
              </div>

              {/* Row 2 — Line + Bar charts (existing, preserved) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <ChartCard title="Heart Rate Trend" isDark={isDark}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                      <XAxis dataKey="createdAt" tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: tickColor, fontSize: 11 }} />
                      <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fill: tickColor, fontSize: 11 }} />
                      <Tooltip contentStyle={ttStyle} />
                      <Line type="monotone" dataKey="heartrate" stroke="#3b82f6" strokeWidth={2} dot={false} name="Heart Rate" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Temperature History (°F)" isDark={isDark}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData.map(d => ({ ...d, temperature: parseFloat(((d.temperature * 9 / 5) + 32).toFixed(1)) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                      <XAxis dataKey="createdAt" tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: tickColor, fontSize: 11 }} />
                      <YAxis tick={{ fill: tickColor, fontSize: 11 }} />
                      <Tooltip formatter={v => `${v} °F`} contentStyle={ttStyle} />
                      <Bar dataKey="temperature" fill="#10b981" radius={[4, 4, 0, 0]} name="Temp" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Row 3 — Health Pie + Air Quality trend */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Overall Health Score" isDark={isDark}>
                  <OverallHealthRing
                    hrValue={latestValidVitals.heartrate}
                    spo2Value={latestValidVitals.spo2}
                    aqiValue={latestValidAQI.airQuality}
                    isDark={isDark}
                  />
                </ChartCard>

                <ChartCard title="Air Quality Trend (AQI)" isDark={isDark}>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                      <XAxis dataKey="createdAt" tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: tickColor, fontSize: 11 }} />
                      <YAxis domain={[0, 200]} tick={{ fill: tickColor, fontSize: 11 }} />
                      <Tooltip contentStyle={ttStyle} />
                      <Line type="monotone" dataKey="airQuality" stroke="#f97316" strokeWidth={2} dot={false} name="AQI" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </>
          ) : (
            <div className={`text-center py-12 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-50'}`}>
              <p className={textMuted}>No sensor data has been recorded for this user yet.</p>
              <p className={`text-sm mt-2 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Click "Start Monitoring" to begin a session.</p>
            </div>
          )}
        </div>
      </main>
    </AnimatedPageWrapper>
  );
};

export default Dashboard;
