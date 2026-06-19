import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CS2_FILTER_GROUPS } from '../constants/cs2Filters';
import { getVoidStackMount } from '../util/voidStackMount';

export default function Cs2FiltersDrawer({ open, filters, onChange, onClose, onSave }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (key) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  const skinsOnly = () => {
    const next = { ...filters };
    CS2_FILTER_GROUPS.forEach((g) => {
      g.items.forEach((i) => {
        next[i.key] = true;
      });
    });
    next.weapon_skin = false;
    onChange(next);
  };

  return createPortal(
    <aside
      className="void-stack-panel void-stack-panel--filters filter-drawer glass"
      role="dialog"
      aria-labelledby="cs2-filters-title"
      data-horizon-surface
    >
      <div className="void-stack-chrome void-stack-chrome--magenta" aria-hidden />
      <div className="filter-drawer-header">
        <div>
          <p className="filter-drawer-kicker">Слой фильтрации</p>
          <h3 id="cs2-filters-title">Фильтры CS2</h3>
          <p className="filter-drawer-sub">Отмечено — бот не покупает</p>
        </div>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>

      <div className="filter-drawer-presets">
        <button type="button" className="btn btn-sm" onClick={skinsOnly}>
          Только скины оружия
        </button>
      </div>

      <div className="filter-drawer-body">
        {CS2_FILTER_GROUPS.map((group) => (
          <section key={group.title} className="filter-group">
            <h4>{group.title}</h4>
            <ul className="filter-list">
              {group.items.map((item) => (
                <li key={item.key}>
                  <label className="filter-row">
                    <input
                      type="checkbox"
                      checked={!!filters[item.key]}
                      onChange={() => toggle(item.key)}
                    />
                    <span className="filter-row-text">
                      <strong>{item.label}</strong>
                      <span className="filter-hint">{item.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="filter-drawer-footer">
        <button type="button" className="btn btn-primary" onClick={onSave}>
          Применить
        </button>
      </div>
    </aside>,
    getVoidStackMount()
  );
}
