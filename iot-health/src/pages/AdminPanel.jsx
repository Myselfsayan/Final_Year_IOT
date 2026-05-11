import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ResponsiveContainer
} from 'recharts';
import Navbar from '../components/Navbar';
import AnimatedPageWrapper from '../components/AnimatedPageWrapper';
import ChartCard from '../components/ChartCard';
import SkeletonCard from '../components/SkeletonCard';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import socket from '../lib/socket';

// ── Threshold helpers (unchanged from original) ───────────────────────────────
const getStatusStyle = (value, thresholds) => {
  if (value > thresholds.critical) return { className: 'text-red-600 font-bold', isCritical: true };
  if (value > thresholds.warning)  return { className: 'text-yellow-600 font-semibold', isCritical: false };
  return { className: 'text-gray-700', isCritical: false };
};

const getSpo2StatusStyle = (value, thresholds) => {
  if (value < thresholds.critical) return { className: 'text-red-600 font-bold', isCritical: true };
  if (value < thresholds.warning)  return { className: 'text-yellow-600 font-semibold', isCritical: false };
  return { className: 'text-gray-700', isCritical: false };
};

const thresholds = {
  heartrate:   { warning: 100, critical: 120 },
  temperature: { warning: 37.5, critical: 38.3 },
  spo2:        { warning: 94,   critical: 90  },
};

const AdminPanel = ({ user, onLogout }) => {
  const [allData, setAllData]           = useState([]);
  const [users, setUsers]               = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userHistory, setUserHistory]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [userLoading, setUserLoading]   = useState(false);
  const { isDark }                      = useTheme();

  const token  = localStorage.getItem('token');
  const config = { headers: { Authorization: `Bearer ${token}` } };

  // ── Dark mode helpers ─────────────────────────────────────────────────────
  const bg        = isDark ? 'bg-slate-900'  : 'bg-gray-50';
  const cardBg    = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100';
  const textPrime = isDark ? 'text-white'    : 'text-gray-800';
  const textMuted = isDark ? 'text-slate-400': 'text-gray-500';
  const gridLine  = isDark ? '#334155'       : '#e5e7eb';
  const tickColor = isDark ? '#94a3b8'       : '#6b7280';
  const ttStyle   = { backgroundColor: isDark ? '#1e293b' : '#fff', borderColor: isDark ? '#334155' : '#e5e7eb', color: isDark ? '#f1f5f9' : '#111' };

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      if (!token) { setLoading(false); return; }
      try {
        const [dataRes, usersRes] = await Promise.all([
          axios.get(`${import.meta.env.VITE_API_URL}/admin/data`, config),
          axios.get(`${import.meta.env.VITE_API_URL}/admin/users`, config),
        ]);
        setAllData(dataRes.data);
        setUsers(usersRes.data);
      } catch (err) {
        console.error('Error fetching admin data:', err.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [token]);

  // ── Socket.IO — update table when any new sensor data arrives ────────────
  useEffect(() => {
    socket.connect();

    socket.on('sensor:update', (newRecord) => {
      // Prepend to overview table
      setAllData(prev => [newRecord, ...prev].slice(0, 50));

      // If the selected user panel is open, append to their history too
      if (selectedUser && String(newRecord.userId?._id || newRecord.userId) === String(selectedUser._id)) {
        setUserHistory(prev => [newRecord, ...prev].slice(0, 50));
      }
    });

    return () => {
      socket.off('sensor:update');
      socket.disconnect();
    };
  }, [selectedUser]);

  // ── Load selected user history ────────────────────────────────────────────
  const handleSelectUser = async (u) => {
    setSelectedUser(u);
    setUserLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/admin/users/${u._id}/data`, config);
      setUserHistory(res.data);
    } catch (err) {
      console.error('Error fetching user history:', err);
      setUserHistory([]);
    } finally {
      setUserLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedUser(null);
    setUserHistory([]);
  };

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AnimatedPageWrapper>
        <Navbar user={user} onLogout={onLogout} />
        <main className={`min-h-screen ${bg}`}>
          <div className="container mx-auto p-4 md:p-8">
            <div className={`h-8 rounded w-64 mb-6 ${isDark ? 'skeleton-dark' : 'skeleton'}`} />
            <div className="flex gap-6">
              <div className="w-56 space-y-3">
                {[...Array(4)].map((_, i) => <SkeletonCard key={i} height="h-12" />)}
              </div>
              <div className="flex-1">
                <SkeletonCard height="h-96" />
              </div>
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
        <div className="container mx-auto p-4 md:p-8">

          <h1 className={`text-3xl font-bold mb-6 ${textPrime}`}>
            Admin Panel
          </h1>

          <div className="flex flex-col lg:flex-row gap-6">

            {/* ── Left sidebar: user list ── */}
            <aside className="lg:w-56 flex-shrink-0">
              <h2 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${textMuted}`}>Users</h2>
              <div className="space-y-2">
                {/* "All Data" option */}
                <button
                  onClick={handleBack}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    !selectedUser
                      ? 'bg-blue-600 text-white border-blue-600'
                      : isDark
                        ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  📋 All Records
                </button>

                {users.map(u => (
                  <button
                    key={u._id}
                    onClick={() => handleSelectUser(u)}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                      selectedUser?._id === u._id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : isDark
                          ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block font-semibold truncate">{u.name}</span>
                    <span className={`text-xs truncate ${selectedUser?._id === u._id ? 'text-blue-100' : textMuted}`}>{u.email}</span>
                  </button>
                ))}
              </div>
            </aside>

            {/* ── Right panel ── */}
            <div className="flex-1 min-w-0">

              {!selectedUser ? (
                /* ── All data overview table (original design preserved) ── */
                <div className={`rounded-lg shadow-xl overflow-x-auto border ${cardBg}`}>
                  <div className={`px-6 py-4 border-b ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
                    <h2 className={`font-semibold ${textPrime}`}>Latest Sensor Records</h2>
                  </div>
                  <table className="w-full text-sm text-left">
                    <thead className={`text-xs uppercase ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-50 text-gray-700'}`}>
                      <tr>
                        <th className="px-6 py-3">User</th>
                        <th className="px-6 py-3">Heart Rate</th>
                        <th className="px-6 py-3">Temp (°F)</th>
                        <th className="px-6 py-3">SpO₂</th>
                        <th className="px-6 py-3">Touch</th>
                        <th className="px-6 py-3">AQI</th>
                        <th className="px-6 py-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allData.map((d, index) => {
                        const hrStyle   = getStatusStyle(d.heartrate, thresholds.heartrate);
                        const tempStyle = getStatusStyle(d.temperature, thresholds.temperature);
                        const spo2Style = getSpo2StatusStyle(d.spo2, thresholds.spo2);
                        const isCrit    = hrStyle.isCritical || tempStyle.isCritical || spo2Style.isCritical;
                        const tempF     = ((d.temperature * 9 / 5) + 32).toFixed(1);
                        return (
                          <motion.tr
                            key={d._id}
                            className={`border-b ${isCrit ? 'bg-red-50' : isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-gray-50'} ${isDark ? 'border-slate-700' : 'border-gray-100'}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.03 }}
                          >
                            <td className={`px-6 py-4 font-medium whitespace-nowrap ${textPrime}`}>{d.userId?.name || 'Unknown'}</td>
                            <td className={`px-6 py-4 ${hrStyle.className}`}>
                              {d.heartrate > 0 ? `${d.heartrate} bpm` : '--'} {hrStyle.isCritical && '⚠️'}
                            </td>
                            <td className={`px-6 py-4 ${tempStyle.className}`}>{tempF} °F {tempStyle.isCritical && '⚠️'}</td>
                            <td className={`px-6 py-4 ${spo2Style.className}`}>
                              {d.spo2 > 0 ? `${d.spo2}%` : '--'} {spo2Style.isCritical && '⚠️'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.touchDetected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {d.touchDetected ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td className={`px-6 py-4 ${textMuted}`}>{d.airQuality ?? '--'}</td>
                            <td className={`px-6 py-4 ${textMuted}`}>
                              {new Date(d.createdAt).toLocaleString('en-US', {
                                year: 'numeric', month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit', hour12: true
                              })}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* ── Selected user analytics ── */
                userLoading ? (
                  <div className="space-y-4">
                    <SkeletonCard height="h-16" />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <SkeletonCard height="h-64" />
                      <SkeletonCard height="h-64" />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <button
                        onClick={handleBack}
                        className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        ← Back
                      </button>
                      <h2 className={`text-xl font-bold ${textPrime}`}>{selectedUser.name}</h2>
                      <span className={`text-sm ${textMuted}`}>{selectedUser.email}</span>
                    </div>

                    {userHistory.length === 0 ? (
                      <div className={`text-center py-16 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-gray-50'}`}>
                        <p className={textMuted}>No data recorded for this user yet.</p>
                      </div>
                    ) : (
                      <>
                        {/* Latest vitals for selected user */}
                        {(() => {
                          const latest = userHistory[0];
                          const tempF  = ((latest.temperature * 9 / 5) + 32).toFixed(1);
                          return (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                              <div className={`card p-4 text-center ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
                                <p className={`text-xs mb-1 ${textMuted}`}>Heart Rate</p>
                                <p className="text-2xl font-bold text-blue-600">
                                  {latest.heartrate > 0 ? `${latest.heartrate} bpm` : 'N/A'}
                                </p>
                              </div>
                              <div className={`card p-4 text-center ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
                                <p className={`text-xs mb-1 ${textMuted}`}>Temperature</p>
                                <p className="text-2xl font-bold text-green-600">{tempF} °F</p>
                              </div>
                              <div className={`card p-4 text-center ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
                                <p className={`text-xs mb-1 ${textMuted}`}>SpO₂</p>
                                <p className="text-2xl font-bold text-red-600">
                                  {latest.spo2 > 0 ? `${latest.spo2}%` : 'N/A'}
                                </p>
                              </div>
                              <div className={`card p-4 text-center ${isDark ? 'bg-slate-800 border-slate-700' : ''}`}>
                                <p className={`text-xs mb-1 ${textMuted}`}>AQI</p>
                                <p className="text-2xl font-bold text-orange-500">{latest.airQuality ?? '--'}</p>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Charts */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <ChartCard title="Heart Rate History" isDark={isDark}>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={userHistory.slice().reverse()}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                                <XAxis dataKey="createdAt" tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: tickColor, fontSize: 10 }} />
                                <YAxis tick={{ fill: tickColor, fontSize: 10 }} />
                                <Tooltip contentStyle={ttStyle} />
                                <Line type="monotone" dataKey="heartrate" stroke="#3b82f6" strokeWidth={2} dot={false} name="HR" />
                              </LineChart>
                            </ResponsiveContainer>
                          </ChartCard>

                          <ChartCard title="Temperature History (°F)" isDark={isDark}>
                            <ResponsiveContainer width="100%" height={250}>
                              <BarChart data={userHistory.slice().reverse().map(d => ({ ...d, temperature: parseFloat(((d.temperature * 9 / 5) + 32).toFixed(1)) }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                                <XAxis dataKey="createdAt" tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: tickColor, fontSize: 10 }} />
                                <YAxis tick={{ fill: tickColor, fontSize: 10 }} />
                                <Tooltip formatter={v => `${v} °F`} contentStyle={ttStyle} />
                                <Bar dataKey="temperature" fill="#10b981" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </ChartCard>

                          <ChartCard title="SpO₂ History" isDark={isDark}>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={userHistory.slice().reverse()}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                                <XAxis dataKey="createdAt" tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: tickColor, fontSize: 10 }} />
                                <YAxis domain={[85, 100]} tick={{ fill: tickColor, fontSize: 10 }} />
                                <Tooltip contentStyle={ttStyle} />
                                <Line type="monotone" dataKey="spo2" stroke="#ef4444" strokeWidth={2} dot={false} name="SpO₂" />
                              </LineChart>
                            </ResponsiveContainer>
                          </ChartCard>

                          <ChartCard title="Air Quality Trend (AQI)" isDark={isDark}>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={userHistory.slice().reverse()}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridLine} />
                                <XAxis dataKey="createdAt" tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fill: tickColor, fontSize: 10 }} />
                                <YAxis domain={[0, 200]} tick={{ fill: tickColor, fontSize: 10 }} />
                                <Tooltip contentStyle={ttStyle} />
                                <Line type="monotone" dataKey="airQuality" stroke="#f97316" strokeWidth={2} dot={false} name="AQI" />
                              </LineChart>
                            </ResponsiveContainer>
                          </ChartCard>
                        </div>
                      </>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </main>
    </AnimatedPageWrapper>
  );
};

export default AdminPanel;
