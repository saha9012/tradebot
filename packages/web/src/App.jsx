import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import History from './pages/History';
import Logs from './pages/Logs';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/settings', label: 'Settings' },
  { to: '/history', label: 'History' },
  { to: '/logs', label: 'Logs' },
];

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">Steam Bot</div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History />} />
          <Route path="/logs" element={<Logs />} />
        </Routes>
      </main>
    </div>
  );
}
