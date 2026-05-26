import { useState, useEffect, useMemo } from 'react';
import api from '../lib/axios';
import Navbar from '../components/Navbar';
import AnimatedPageWrapper from '../components/AnimatedPageWrapper';
import SkeletonCard from '../components/SkeletonCard';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import socket from '../lib/socket';
import { FiSearch, FiUser, FiActivity, FiThermometer, FiDroplet, FiWind, FiArrowLeft, FiUsers } from 'react-icons/fi';

// ── Thresholds ────────────────────────────────────────────────────────────────
const thresholds = {
  heartrate:   { warning: 100, critical: 120 },
  temperature: { warning: 37.5, critical: 38.3 },
  spo2:        { warning: 94, critical: 90 },
};

// ── Health status computation ─────────────────────────────────────────────────
const getOverallHealth = (record) => {
  if (!record) return { label: 'No Data', color: 'gray', bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' };

  const { heartrate, temperature, spo2 } = record;
  const hrCrit   = heartrate > thresholds.heartrate.critical;
  const tempCrit = temperature > thresholds.temperature.critical;
  const spo2Crit = spo2 > 0 && spo2 < thresholds.spo2.critical;

  const hrWarn   = heartrate > thresholds.heartrate.warning;
  const tempWarn = temperature > thresholds.temperature.warning;
  const spo2Warn = spo2 > 0 && spo2 < thresholds.spo2.warning;

  if (hrCrit || tempCrit || spo2Crit)
    return { label: 'Critical', color: 'red',    bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    border: 'border-red-200' };
  if (hrWarn || tempWarn || spo2Warn)
    return { label: 'Warning',  color: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', border: 'border-yellow-200' };
  return { label: 'Healthy',   color: 'green',  bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  border: 'border-green-200' };
};

// ── Stat cell in user detail table ───────────────────────────────────────────
const statClass = (type, value) => {
  if (!value || value <= 0) return 'text-gray-400';
  if (type === 'hr') {
    if (value > thresholds.heartrate.critical) return 'text-red-600 font-bold';
    if (value > thresholds.heartrate.warning)  return 'text-yellow-600 font-semibold';
  }
  if (type === 'temp') {
    if (value > thresholds.temperature.critical) return 'text-red-600 font-bold';
    if (value > thresholds.temperature.warning)  return 'text-yellow-600 font-semibold';
  }
  if (type === 'spo2') {
    if (value < thresholds.spo2.critical) return 'text-red-600 font-bold';
    if (value < thresholds.spo2.warning)  return 'text-yellow-600 font-semibold';
  }
  return 'text-gray-700';
};

// ── Avatar initials ───────────────────────────────────────────────────────────
const getInitials = (name = '') =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const avatarColors = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-green-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-500',
  'from-cyan-500 to-teal-600',
];
const getAvatarColor = (name = '') => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
};

// ─────────────────────────────────────────────────────────────────────────────

const AdminPanel = ({ user, onLogout }) => {
  const [users, setUsers]               = useState([]);
  const [latestByUser, setLatestByUser] = useState({}); // userId → latest record
  const [selectedUser, setSelectedUser] = useState(null);
  const [userHistory, setUserHistory]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [userLoading, setUserLoading]   = useState(false);
  const [search, setSearch]             = useState('');
  const { isDark }                      = useTheme();

  const token = localStorage.getItem('token');

  // ── Theme helpers ─────────────────────────────────────────────────────────
  const bg        = isDark ? 'bg-slate-900'  : 'bg-gray-50';
  const cardBg    = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100';
  const textPrime = isDark ? 'text-white'    : 'text-gray-800';
  const textMuted = isDark ? 'text-slate-400': 'text-gray-500';
  const inputBg   = isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400';
  const theadBg   = isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-50 text-gray-600';
  const rowHover  = isDark ? 'hover:bg-slate-700 border-slate-700' : 'hover:bg-gray-50 border-gray-100';

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      if (!token) { setLoading(false); return; }
      try {
        const [dataRes, usersRes] = await Promise.all([
          api.get('admin/data'),
          api.get('admin/users'),
        ]);

        // Build latest-record-per-user map from the global data feed
        const latest = {};
        dataRes.data.forEach(record => {
          const uid = String(record.userId?._id || record.userId);
          if (!latest[uid]) latest[uid] = record; // first = newest (sorted desc)
        });
        setLatestByUser(latest);
        setUsers(usersRes.data);
      } catch (err) {
        console.error('Admin fetch error:', err.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [token]);

  // ── Socket: update latest vitals in real-time ─────────────────────────────
  useEffect(() => {
    if (!socket.connected) socket.connect();

    const onSensorUpdate = (newRecord) => {
      const uid = String(newRecord.userId?._id || newRecord.userId);
      setLatestByUser(prev => ({ ...prev, [uid]: newRecord }));

      if (selectedUser && uid === String(selectedUser._id)) {
        setUserHistory(prev => [newRecord, ...prev].slice(0, 50));
      }
    };

    socket.on('sensor:update', onSensorUpdate);

    return () => {
      // Only remove this component's listener — never disconnect the shared socket
      socket.off('sensor:update', onSensorUpdate);
    };
  }, [selectedUser]);


  // ── Load selected user's history ──────────────────────────────────────────
  const handleSelectUser = async (u) => {
    setSelectedUser(u);
    setUserLoading(true);
    try {
      const res = await api.get(`admin/users/${u._id}/data`);
      setUserHistory(res.data);
    } catch (err) {
      console.error('Error fetching user history:', err);
      setUserHistory([]);
    } finally {
      setUserLoading(false);
    }
  };

  const handleBack = () => { setSelectedUser(null); setUserHistory([]); };

  // ── Filtered user list ────────────────────────────────────────────────────
  const filteredUsers = useMemo(() =>
    users.filter(u =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    ), [users, search]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <AnimatedPageWrapper>
        <Navbar user={user} onLogout={onLogout} />
        <main className={`min-h-screen ${bg}`}>
          <div className="container mx-auto p-4 md:p-8">
            <div className={`h-8 rounded w-48 mb-6 ${isDark ? 'skeleton-dark' : 'skeleton'}`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(6)].map((_, i) => <SkeletonCard key={i} height="h-36" />)}
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

          {/* ── Page header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
            <div>
              <h1 className={`text-2xl font-bold ${textPrime}`}>Admin Panel</h1>
              <p className={`text-sm mt-0.5 ${textMuted}`}>
                {selectedUser ? `Viewing records for ${selectedUser.name}` : `${users.length} registered user${users.length !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Back button when viewing user detail */}
            {selectedUser && (
              <button
                onClick={handleBack}
                className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border font-medium transition-colors ${
                  isDark
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FiArrowLeft size={15} />
                All Users
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">

            {/* ══════════════════════════════════════════════════════════════
                VIEW 1 — User cards grid
            ══════════════════════════════════════════════════════════════ */}
            {!selectedUser && (
              <motion.div
                key="user-grid"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
              >
                {/* Search bar */}
                <div className="relative max-w-sm mb-6">
                  <FiSearch className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} size={16} />
                  <input
                    type="text"
                    placeholder="Search by name or email…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className={`w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${inputBg}`}
                  />
                </div>

                {filteredUsers.length === 0 ? (
                  <div className={`text-center py-20 rounded-xl border ${cardBg}`}>
                    <FiUsers size={36} className={`mx-auto mb-3 ${textMuted}`} />
                    <p className={`font-medium ${textPrime}`}>No users found</p>
                    <p className={`text-sm mt-1 ${textMuted}`}>Try a different search term</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredUsers.map((u, i) => {
                      const latest = latestByUser[String(u._id)];
                      const health = getOverallHealth(latest);
                      const tempF  = latest ? ((latest.temperature * 9 / 5) + 32).toFixed(1) : null;
                      const avatarGrad = getAvatarColor(u.name);

                      return (
                        <motion.div
                          key={u._id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          onClick={() => handleSelectUser(u)}
                          className={`group relative rounded-xl border p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${cardBg}`}
                        >
                          {/* Health status dot */}
                          <span className={`absolute top-4 right-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${health.bg} ${health.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
                            {health.label}
                          </span>

                          {/* Avatar */}
                          <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white font-bold text-sm mb-4 shadow-md`}>
                            {getInitials(u.name)}
                          </div>

                          {/* Name / email */}
                          <p className={`font-semibold text-sm truncate pr-16 ${textPrime}`}>{u.name}</p>
                          <p className={`text-xs truncate ${textMuted}`}>{u.email}</p>

                          {/* Vitals summary */}
                          {latest ? (
                            <div className={`mt-4 grid grid-cols-3 gap-2 pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
                              <div className="text-center">
                                <p className={`text-[10px] uppercase tracking-wide mb-0.5 ${textMuted}`}>HR</p>
                                <p className={`text-sm font-bold ${latest.heartrate > 0 ? (isDark ? 'text-blue-400' : 'text-blue-600') : textMuted}`}>
                                  {latest.heartrate > 0 ? `${latest.heartrate}` : '--'}
                                </p>
                                <p className={`text-[9px] ${textMuted}`}>bpm</p>
                              </div>
                              <div className="text-center">
                                <p className={`text-[10px] uppercase tracking-wide mb-0.5 ${textMuted}`}>Temp</p>
                                <p className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{tempF}</p>
                                <p className={`text-[9px] ${textMuted}`}>°F</p>
                              </div>
                              <div className="text-center">
                                <p className={`text-[10px] uppercase tracking-wide mb-0.5 ${textMuted}`}>SpO₂</p>
                                <p className={`text-sm font-bold ${latest.spo2 > 0 ? (isDark ? 'text-rose-400' : 'text-rose-600') : textMuted}`}>
                                  {latest.spo2 > 0 ? `${latest.spo2}%` : '--'}
                                </p>
                                <p className={`text-[9px] ${textMuted}`}>sat</p>
                              </div>
                            </div>
                          ) : (
                            <div className={`mt-4 pt-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
                              <p className={`text-xs text-center ${textMuted}`}>No readings yet</p>
                            </div>
                          )}

                          {/* Click hint */}
                          <p className={`text-[10px] mt-3 text-center transition-opacity opacity-0 group-hover:opacity-100 ${isDark ? 'text-blue-400' : 'text-blue-500'}`}>
                            Click to view all records →
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                VIEW 2 — User detail: data table
            ══════════════════════════════════════════════════════════════ */}
            {selectedUser && (
              <motion.div
                key="user-detail"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
              >
                {/* User info header */}
                <div className={`flex flex-wrap items-center gap-4 rounded-xl border p-5 mb-6 ${cardBg}`}>
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(selectedUser.name)} flex items-center justify-center text-white font-bold shadow-md`}>
                    {getInitials(selectedUser.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-base ${textPrime}`}>{selectedUser.name}</p>
                    <p className={`text-sm ${textMuted}`}>{selectedUser.email}</p>
                  </div>
                  {userHistory.length > 0 && (() => {
                    const latest = userHistory[0];
                    const health = getOverallHealth(latest);
                    return (
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1.5 ${health.bg} ${health.text}`}>
                        <span className={`w-2 h-2 rounded-full ${health.dot}`} />
                        {health.label}
                      </span>
                    );
                  })()}
                  <span className={`text-sm ${textMuted}`}>
                    {userHistory.length} record{userHistory.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Data table */}
                {userLoading ? (
                  <SkeletonCard height="h-80" />
                ) : userHistory.length === 0 ? (
                  <div className={`text-center py-20 rounded-xl border ${cardBg}`}>
                    <FiActivity size={36} className={`mx-auto mb-3 ${textMuted}`} />
                    <p className={`font-medium ${textPrime}`}>No data recorded yet</p>
                    <p className={`text-sm mt-1 ${textMuted}`}>Readings will appear here once the device is active</p>
                  </div>
                ) : (
                  <div className={`rounded-xl border shadow-sm overflow-hidden ${cardBg}`}>
                    <div className={`px-6 py-3.5 border-b flex items-center justify-between ${isDark ? 'border-slate-700' : 'border-gray-100'}`}>
                      <p className={`text-sm font-semibold ${textPrime}`}>Sensor History</p>
                      <p className={`text-xs ${textMuted}`}>Latest {userHistory.length} readings (FIFO queue, max 50)</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className={`text-xs uppercase tracking-wide ${theadBg}`}>
                          <tr>
                            <th className="px-5 py-3">#</th>
                            <th className="px-5 py-3">Heart Rate</th>
                            <th className="px-5 py-3">Temp (°F)</th>
                            <th className="px-5 py-3">SpO₂</th>
                            <th className="px-5 py-3">AQI</th>
                            <th className="px-5 py-3">Status</th>
                            <th className="px-5 py-3">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userHistory.map((d, index) => {
                            const health = getOverallHealth(d);
                            const tempF  = ((d.temperature * 9 / 5) + 32).toFixed(1);
                            const hrCls   = statClass('hr',   d.heartrate);
                            const tempCls = statClass('temp', d.temperature);
                            const spo2Cls = statClass('spo2', d.spo2);
                            return (
                              <motion.tr
                                key={d._id}
                                className={`border-b transition-colors ${rowHover} ${isDark ? 'bg-slate-800' : 'bg-white'}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: Math.min(index * 0.02, 0.4) }}
                              >
                                <td className={`px-5 py-3.5 text-xs ${textMuted}`}>{index + 1}</td>
                                <td className={`px-5 py-3.5 font-medium ${hrCls}`}>
                                  {d.heartrate > 0 ? `${d.heartrate} bpm` : <span className={textMuted}>--</span>}
                                </td>
                                <td className={`px-5 py-3.5 font-medium ${tempCls}`}>{tempF} °F</td>
                                <td className={`px-5 py-3.5 font-medium ${spo2Cls}`}>
                                  {d.spo2 > 0 ? `${d.spo2}%` : <span className={textMuted}>--</span>}
                                </td>
                                <td className={`px-5 py-3.5 ${textMuted}`}>{d.airQuality ?? '--'}</td>
                                <td className="px-5 py-3.5">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${health.bg} ${health.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
                                    {health.label}
                                  </span>
                                </td>
                                <td className={`px-5 py-3.5 whitespace-nowrap ${textMuted}`}>
                                  {new Date(d.createdAt).toLocaleString('en-US', {
                                    month: 'short', day: 'numeric',
                                    hour: '2-digit', minute: '2-digit', hour12: true,
                                  })}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
    </AnimatedPageWrapper>
  );
};

export default AdminPanel;
