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

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, enterPage, enterHub } = useHorizonMode();

  const handleNodeClick = (path) => {
    navigate(path);
  };

  const handleHubBackdropDoubleClick = () => {
    enterPage();
  };

  const handlePageBackdropDoubleClick = () => {
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
    <div className="noise relative flex min-h-screen bg-void text-white">
      <BackgroundEffects />
      <CursorGlow />

      <div
        className={`relative flex-1 ${isHub ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
      >
        <PageShell mode={mode} onBackdropDoubleClick={handlePageBackdropDoubleClick}>
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
          onBackdropDoubleClick={handleHubBackdropDoubleClick}
        />
      </div>
    </div>
  );
}
