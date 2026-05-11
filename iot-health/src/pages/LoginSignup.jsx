import { useState } from 'react';
import api from '../lib/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMail, FiLock, FiUser, FiActivity } from 'react-icons/fi';
import AnimatedPageWrapper from '../components/AnimatedPageWrapper';

const InputField = ({ id, name, type, label, icon: Icon, required, onChange }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    <div className="relative">
      <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
        <Icon size={16} />
      </span>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        onChange={onChange}
        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg shadow-sm text-sm
          focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-none
          bg-white text-gray-800 placeholder-gray-400 transition-all duration-200"
      />
    </div>
  </div>
);

const LoginSignup = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/login' : '/signup';

    try {
      const { data } = await api.post(endpoint, formData);
      if (isLogin) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data));
        onLogin(data);
      } else {
        setIsLogin(true);
        setError('Account created! Please log in.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatedPageWrapper>
      {/* Animated gradient background */}
      <div className="bg-animated min-h-screen flex items-center justify-center px-4 py-12">

        <motion.div
          key={isLogin ? 'login' : 'signup'}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md"
        >
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl px-8 pt-8 pb-10 border border-white/60">

            {/* Logo / branding */}
            <div className="flex flex-col items-center mb-7">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-3 shadow-inner">
                <FiActivity size={28} className="text-blue-600" />
              </div>
              <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {isLogin ? 'Sign in to your health dashboard' : 'Join the health monitoring platform'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence>
                {!isLogin && (
                  <motion.div
                    key="name-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <InputField
                      id="name" name="name" type="text" label="Full Name"
                      icon={FiUser} required={!isLogin} onChange={handleChange}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <InputField
                id="email" name="email" type="email" label="Email Address"
                icon={FiMail} required onChange={handleChange}
              />

              <InputField
                id="password" name="password" type="password" label="Password"
                icon={FiLock} required onChange={handleChange}
              />

              {/* Error / success message */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`text-sm text-center font-semibold px-3 py-2 rounded-lg ${
                      error.toLowerCase().includes('created') || error.toLowerCase().includes('successful')
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                id="auth-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                  text-white font-semibold rounded-lg shadow-md
                  focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2
                  disabled:bg-gray-300 disabled:cursor-not-allowed
                  transition-all duration-200 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing...
                  </>
                ) : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            {/* Toggle link */}
            <p className="mt-6 text-sm text-center text-gray-600">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                id="auth-toggle-btn"
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="font-semibold text-blue-600 hover:underline focus:outline-none"
              >
                {isLogin ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        </motion.div>

      </div>
    </AnimatedPageWrapper>
  );
};

export default LoginSignup;
