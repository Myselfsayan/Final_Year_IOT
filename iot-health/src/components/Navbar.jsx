import { Link, useNavigate } from 'react-router-dom';
import { FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from '../context/ThemeContext';

const Navbar = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const { isDark, toggleDark } = useTheme();

  const handleLogout = () => {
    if (onLogout) onLogout();
    navigate('/');
  };

  return (
    <nav className={`sticky top-0 z-50 shadow-md transition-colors duration-300 ${isDark ? 'bg-slate-900 border-b border-slate-700' : 'bg-white'}`}>
      <div className="container mx-auto px-6 py-3 flex justify-between items-center">
        <Link
          to={user?.role === 'admin' ? '/admin' : '/dashboard'}
          className={`text-xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-gray-800'}`}
        >
          <span className="text-blue-500">♥</span>
          Health Monitor
        </Link>

        <div className="flex items-center gap-3">
          {user && (
            <span className={`text-sm mr-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
              Welcome, <span className="font-semibold">{user.name}</span>
            </span>
          )}

          {/* Dark Mode Toggle */}
          <button
            id="dark-mode-toggle"
            onClick={toggleDark}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`p-2 rounded-lg transition-colors duration-200 ${
              isDark
                ? 'bg-slate-700 text-yellow-400 hover:bg-slate-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isDark ? <FiSun size={18} /> : <FiMoon size={18} />}
          </button>

          <button
            id="logout-btn"
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors duration-200"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
