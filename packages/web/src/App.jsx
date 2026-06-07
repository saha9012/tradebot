import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import BackgroundEffects from './components/BackgroundEffects';
import CursorGlow from './components/CursorGlow';
import PageTransition from './components/PageTransition';
import useHorizonMode from './hooks/useHorizonMode';
import HorizonNav from './horizon/HorizonNav';
import PageShell from './horizon/PageShell';
import Dashboard from './pages/Dashboard';
import SettingsPage from './pages/Settings';
import HistoryPage from './pages/History';
import Logs from './pages/Logs';
import Analytics from './pages/Analytics';
import Decisions from './pages/Decisions';
import FetchDebug from './pages/FetchDebug';
import Sales from './pages/Sales';
import Compare from './pages/Compare';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, enterPage, enterHub } = useHorizonMode();

  const handleNodeClick = (path) => {
    navigate(path);
  };

  const handleHubBackdropClick = () => {
    enterPage();
  };

  const handlePageBackdropClick = () => {
    enterHub();
  };

  const isHub = mode === 'hub';

  useEffect(() => {
    const overflow = isHub ? 'hidden' : '';
    document.documentElement.style.overflow = overflow;
    document.body.style.overflow = overflow;
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [isHub]);

  return (
    <div className="noise relative isolate flex min-h-screen text-white">
      <BackgroundEffects activePath={location.pathname} mode={mode} />
      <CursorGlow />

      <div
        className={`relative z-10 flex-1 ${isHub ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
      >
        <p className="horizon-top-hint pointer-events-none fixed left-1/2 top-6 z-[25] w-full max-w-3xl -translate-x-1/2 px-6 text-center md:top-8 lg:top-10">
          {isHub
            ? 'Клик по узлу — смена страницы на фоне · клик по пустому месту — открыть страницу'
            : 'Клик по пустому месту — вернуться к ветке'}
        </p>

        <PageShell mode={mode} onBackdropClick={handlePageBackdropClick}>
          <div className={isHub ? 'relative min-h-[calc(100vh-5rem)]' : 'relative'}>
            <AnimatePresence mode={isHub ? 'sync' : 'wait'} initial={false}>
              <PageTransition key={location.pathname} mode={mode}>
                <Routes location={location}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/decisions" element={<Decisions />} />
                  <Route path="/debug-fetch" element={<FetchDebug />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/compare" element={<Compare />} />
                  <Route path="/logs" element={<Logs />} />
                </Routes>
              </PageTransition>
            </AnimatePresence>
          </div>
        </PageShell>

        <HorizonNav
          mode={mode}
          activePath={location.pathname}
          onNodeClick={handleNodeClick}
          onBackdropClick={handleHubBackdropClick}
        />
      </div>
    </div>
  );
}
