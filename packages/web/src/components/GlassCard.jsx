import { motion } from 'framer-motion';

export default function GlassCard({ title, children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={`glass rounded-2xl p-5 ${className}`}
    >
      {title && (
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/45">{title}</h3>
      )}
      {children}
    </motion.div>
  );
}
