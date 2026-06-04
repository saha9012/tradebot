import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Settings,
  History,
  ScrollText,
  BarChart3,
  Bug,
  Zap,
} from 'lucide-react';
import BackgroundEffects from './components/BackgroundEffects';
import CursorGlow from './components/CursorGlow';
import StatusMarquee from './components/StatusMarquee';
import PageTransition from './components/PageTransition';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import HistoryPage from './pages/History';
import Logs from './pages/Logs';
import Analytics from './pages/Analytics';
import FetchDebug from './pages/FetchDebug';

const links = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard },
  { to: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { to: '/debug-fetch', label: 'Отладка fetch', icon: Bug, temp: true },
  { to: '/settings', label: 'Настройки', icon: Settings },
  { to: '/history', label: 'Сделки', icon: History },
  { to: '/logs', label: 'Логи', icon: ScrollText },
];

export default function App() {
  const location = useLocation();

  return (
    <div className="noise relative flex min-h-screen bg-void text-white">
      <BackgroundEffects />
      <CursorGlow />

      <motion.aside
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong relative z-10 flex w-[240px] shrink-0 flex-col border-r border-white/5 px-4 py-6"
      >
        <div className="mb-8 px-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-black">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-lg font-bold leading-tight">
                ST<span className="text-cyan-400">EAM</span>
              </p>
              <p className="text-[10px] uppercase tracking-widest text-white/40">Market Bot</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {links.map((l, i) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  isActive
                    ? 'bg-white/10 text-white shadow-lg shadow-cyan-500/10'
                    : 'text-white/50 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                  >
                    <l.icon
                      className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-white/40 group-hover:text-cyan-300'}`}
                    />
                  </motion.span>
                  {l.label}
                  {l.temp && (
                    <span className="ml-1 rounded bg-amber-500/25 px-1 text-[9px] uppercase text-amber-300">
                      dev
                    </span>
                  )}
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff]" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <p className="mt-auto px-2 pt-8 text-[11px] leading-relaxed text-white/30">
          Стиль{' '}
          <a
            href="https://github.com/saha9012/Flare-Studio"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400/80 hover:text-cyan-300"
          >
            Flare Studio
          </a>
        </p>
      </motion.aside>

      <main className="relative z-10 flex-1 overflow-auto p-6 md:p-8 lg:p-10">
        <StatusMarquee />
        <PageTransition key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/debug-fetch" element={<FetchDebug />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/logs" element={<Logs />} />
          </Routes>
        </PageTransition>
      </main>
    </div>
  );
}
