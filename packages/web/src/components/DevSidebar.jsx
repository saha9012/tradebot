import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings,
  History,
  ScrollText,
  BarChart3,
  ListChecks,
  Bug,
} from 'lucide-react';

const links = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard },
  { to: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { to: '/decisions', label: 'Решения', icon: ListChecks },
  { to: '/debug-fetch', label: 'Отладка', icon: Bug },
  { to: '/settings', label: 'Настройки', icon: Settings },
  { to: '/history', label: 'Сделки', icon: History },
  { to: '/logs', label: 'Логи', icon: ScrollText },
];

/** Временная навигация только для разработки — убрать когда ветка стабильна. */
export default function DevSidebar({ onNavigate }) {
  return (
    <aside className="dev-sidebar glass-strong relative z-50 flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-amber-500/20 py-4">
      <span
        className="mb-2 rotate-180 text-[9px] font-bold uppercase tracking-widest text-amber-400/80"
        style={{ writingMode: 'vertical-rl' }}
        title="Только dev — убрать после готовности ветки"
      >
        DEV
      </span>
      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            title={l.label}
            onClick={() => onNavigate?.()}
            className={({ isActive }) =>
              `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-white/40 hover:bg-white/5 hover:text-white/70'
              }`
            }
          >
            <l.icon className="h-4 w-4" />
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
