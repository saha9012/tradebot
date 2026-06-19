import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Percent, Layers, Clock } from 'lucide-react';
import { api } from '../api/client';
import FieldLabel from './FieldLabel';
import Cs2FiltersDrawer from './Cs2FiltersDrawer';
import { mergeCs2Filters } from '../constants/cs2Filters';

const TABS = [
  { id: 'profit', label: 'Прибыль', icon: Percent },
  { id: 'liquidity', label: 'Ликвидность', icon: Layers },
  { id: 'schedule', label: 'Расписание', icon: Clock },
];

export default function AccountSettingsModal({ account, open, onClose, onUpdate }) {
  const [config, setConfig] = useState(account.strategy || {});
  const [tab, setTab] = useState('profit');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setConfig({
        ...(account.strategy || {}),
        cs2Filters: mergeCs2Filters(account.strategy?.cs2Filters),
      });
      setTab('profit');
      setErr('');
      setMsg('');
    } else {
      setFiltersOpen(false);
    }
  }, [open, account]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && filtersOpen) {
      document.body.classList.add('void-filters-open');
    } else {
      document.body.classList.remove('void-filters-open');
    }
    return () => document.body.classList.remove('void-filters-open');
  }, [open, filtersOpen]);

  if (!open) return null;

  const isCs2 = account.game === 'cs2';
  const setNum = (key) => (e) => setConfig({ ...config, [key]: Number(e.target.value) });

  const save = async (partial) => {
    setBusy(true);
    setErr('');
    try {
      const payload = partial ? { ...config, ...partial } : config;
      await api.updateStrategy(account.id, payload);
      setConfig(payload);
      setMsg('Сохранено');
      onUpdate();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(''), 2500);
    }
  };

  return createPortal(
    <>
      <div
        className="void-stack-panel void-stack-panel--strategy account-settings-modal glass-strong"
        role="dialog"
        aria-labelledby="account-settings-title"
        data-horizon-surface
      >
        <div className="void-stack-chrome" aria-hidden />
        <div className="account-settings-header">
          <div>
            <h2 id="account-settings-title">{account.label}</h2>
          </div>
          <div className="account-settings-header-actions">
            <p className="account-settings-kicker">Стратегия · {account.game.toUpperCase()}</p>
            {isCs2 && (
              <button type="button" className="btn btn-sm btn-filter" onClick={() => setFiltersOpen(true)}>
                <Filter className="h-3.5 w-3.5" />
                Фильтры CS2
              </button>
            )}
            <button type="button" className="drawer-close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>

        <nav className="settings-tabs" aria-label="Разделы настроек">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`settings-tab ${tab === id ? 'settings-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <div className="account-settings-body">
          {tab === 'profit' && (
            <section className="settings-panel">
              <h3 className="settings-panel-title">Когда покупать</h3>
              <p className="settings-panel-desc">
                Бот ставит buy-ордер только если чистая прибыль попадает в коридор и цена ниже лимита.
              </p>
              <div className="settings-fields-grid">
                <FieldLabel label="Мин. прибыль, %" hint="Ниже — пропуск. Обычно 20.">
                  <input type="number" className="input-compact" value={config.minProfitPercent ?? ''} onChange={setNum('minProfitPercent')} />
                </FieldLabel>
                <FieldLabel label="Макс. прибыль, %" hint="Выше — пропуск. Обычно 40.">
                  <input type="number" className="input-compact" value={config.maxProfitPercent ?? ''} onChange={setNum('maxProfitPercent')} />
                </FieldLabel>
                <FieldLabel label="Макс. цена, ₽" hint="Не покупать дороже.">
                  <input type="number" className="input-compact" value={config.maxItemPrice ?? ''} onChange={setNum('maxItemPrice')} />
                </FieldLabel>
                <FieldLabel label="Комиссия Steam, %" hint="~15% с продажи.">
                  <input type="number" className="input-compact" value={config.feePercent ?? ''} onChange={setNum('feePercent')} />
                </FieldLabel>
                <FieldLabel label="Шаг перебива, ₽" hint="Buy +0.01 к лучшему ордеру.">
                  <input type="number" step="0.01" className="input-compact" value={config.undercutStep ?? ''} onChange={setNum('undercutStep')} />
                </FieldLabel>
              </div>
            </section>
          )}

          {tab === 'liquidity' && (
            <section className="settings-panel">
              <h3 className="settings-panel-title">Ликвидность и объём ордера</h3>
              <p className="settings-panel-desc">
                Чем больше продаж в сутки — тем больше штук в одном buy-ордере.
              </p>
              <div className="settings-fields-grid">
                <FieldLabel label="Мин. продаж / сутки" hint="Volume Steam за 24ч.">
                  <input type="number" className="input-compact" value={config.minLiquidity ?? ''} onChange={setNum('minLiquidity')} />
                </FieldLabel>
              </div>
              <div className="settings-tier-cards">
                <div className="settings-tier-card">
                  <span className="settings-tier-badge">Тир 1</span>
                  <FieldLabel label="Ликвидность от" hint="Продаж/сутки.">
                    <input type="number" className="input-compact" value={config.liquidityMin ?? ''} onChange={setNum('liquidityMin')} />
                  </FieldLabel>
                  <FieldLabel label="Штук в ордере" hint="Buy qty.">
                    <input type="number" className="input-compact" value={config.orderQtyMin ?? ''} onChange={setNum('orderQtyMin')} />
                  </FieldLabel>
                </div>
                <div className="settings-tier-card">
                  <span className="settings-tier-badge settings-tier-badge--high">Тир 2</span>
                  <FieldLabel label="Ликвидность от" hint="Высокая ликвидность.">
                    <input type="number" className="input-compact" value={config.liquidityMax ?? ''} onChange={setNum('liquidityMax')} />
                  </FieldLabel>
                  <FieldLabel label="Штук в ордере" hint="Buy qty.">
                    <input type="number" className="input-compact" value={config.orderQtyMax ?? ''} onChange={setNum('orderQtyMax')} />
                  </FieldLabel>
                </div>
              </div>
            </section>
          )}

          {tab === 'schedule' && (
            <section className="settings-panel">
              <h3 className="settings-panel-title">Лимиты и перевыставление</h3>
              <p className="settings-panel-desc">Окна relist и дневной потолок трат.</p>
              <div className="settings-fields-grid settings-fields-grid--3">
                <FieldLabel label="Утро" hint="Первое окно relist.">
                  <input type="time" className="input-compact" value={config.relistMorning ?? ''} onChange={(e) => setConfig({ ...config, relistMorning: e.target.value })} />
                </FieldLabel>
                <FieldLabel label="День" hint="Второе окно.">
                  <input type="time" className="input-compact" value={config.relistAfternoon ?? ''} onChange={(e) => setConfig({ ...config, relistAfternoon: e.target.value })} />
                </FieldLabel>
                <FieldLabel label="Вечер" hint="Третье окно.">
                  <input type="time" className="input-compact" value={config.relistEvening ?? ''} onChange={(e) => setConfig({ ...config, relistEvening: e.target.value })} />
                </FieldLabel>
              </div>
              <div className="settings-limit-row">
                <label className="settings-limit-check">
                  <input
                    type="checkbox"
                    checked={!!config.maxSpendPerDayEnabled}
                    onChange={(e) => setConfig({ ...config, maxSpendPerDayEnabled: e.target.checked })}
                  />
                  <span>Лимит трат в день</span>
                </label>
                <FieldLabel label="Макс. ₽ / сутки" hint="Только если лимит включён.">
                  <input
                    type="number"
                    className="input-compact input-compact--short"
                    value={config.maxSpendPerDay ?? ''}
                    disabled={!config.maxSpendPerDayEnabled}
                    onChange={setNum('maxSpendPerDay')}
                  />
                </FieldLabel>
              </div>
            </section>
          )}
        </div>

        <div className="account-settings-footer">
          <button type="button" className="btn btn-primary" onClick={() => save()} disabled={busy}>
            Сохранить
          </button>
          {msg && <span className="text-sm text-emerald-400">{msg}</span>}
          {err && <p className="error">{err}</p>}
        </div>
      </div>

      {isCs2 && (
        <Cs2FiltersDrawer
          open={filtersOpen}
          filters={config.cs2Filters || mergeCs2Filters()}
          onChange={(cs2Filters) => setConfig({ ...config, cs2Filters })}
          onClose={() => setFiltersOpen(false)}
          onSave={async () => {
            await save({ cs2Filters: config.cs2Filters });
            setFiltersOpen(false);
          }}
        />
      )}
    </>,
    document.body
  );
}
