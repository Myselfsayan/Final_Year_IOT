import { useTheme } from '../context/ThemeContext';

const SkeletonCard = ({ height = 'h-16' }) => {
  const { isDark } = useTheme();
  return (
    <div className={`rounded-xl border p-6 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
      <div className={`h-3 rounded w-1/3 mb-4 ${isDark ? 'skeleton-dark' : 'skeleton'}`} />
      <div className={`rounded ${height} ${isDark ? 'skeleton-dark' : 'skeleton'}`} />
    </div>
  );
};

export default SkeletonCard;
