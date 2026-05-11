import { motion } from 'framer-motion';

const ChartCard = ({ title, children, isDark = false }) => (
  <motion.div
    className={`p-6 rounded-lg shadow-md border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}
    whileHover={{ scale: 1.01 }}
    transition={{ type: 'spring', stiffness: 300 }}
  >
    <h3 className={`font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>{title}</h3>
    <div style={{ width: '100%', height: 300 }}>
      {children}
    </div>
  </motion.div>
);

export default ChartCard;
