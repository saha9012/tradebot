import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

function fmtDetail(detail) {
  if (detail == null) return '—';
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

export default function FetchDebug() {
  const [paused, setPaused] = useState(false);
  const [events, setEvents] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [buyName, setBuyName] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyQty, setBuyQty] = useState('1');
  const sinceIdRef = useRef(0);

  const loadAccounts = useCallback(() => {
    api.getAccounts().then((rows) => {
      setAccounts(rows);
      if (!accountId && rows.length) setAccountId(rows[0].id);
    }).catch(console.error);
  }, [accountId]);

  const loadEvents = useCallback(async (reset = false) => {
    try {
      const params = reset ? { limit: 200 } : { sinceId: sinceIdRef.current, limit: 200 };
      const rows = await api.getFetchDebug(params);
      if (!rows.length) return;

      if (reset) {
        sinceIdRef.current = Math.max(...rows.map((r) => r.id));
        setEvents(rows);
        return;
      }

      const fresh = rows.filter((r) => r.id > sinceIdRef.current);
      if (!fresh.length) return;
      sinceIdRef.current = Math.max(sinceIdRef.current, ...fresh.map((r) => r.id));
      setEvents((prev) => [...fresh, ...prev].slice(0, 500));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadEvents(true);
  }, [loadAccounts, loadEvents]);

  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => loadEvents(false), 2500);
    return () => clearInterval(t);
  }, [paused, loadEvents]);

  const clear = async () => {
    await api.clearFetchDebug();
    sinceIdRef.current = 0;
    setEvents([]);
  };

  const runAction = async (key, fn) => {
    if (!accountId) {
      setErr('Выбери аккаунт');
      return;
    }
    setBusy(key);
    setErr('');
    try {
      await fn();
      await loadEvents(false);
    } catch (e) {
      setErr(e.message);
      await loadEvents(false);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Отладка</span>
      </h1>

      <p className="mb-4 text-sm text-white/45">
        Ручные проверки Steam. Бот в фоне сюда не пишет — только кнопки ниже.
      </p>

      <GlassCard className="mb-6 p-4">
        <div className="debug-actions-stack">
          <label className="field-label">
            <span>Аккаунт</span>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.game}) {a.sessionActive ? '— онлайн' : '— офлайн'}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy}
            onClick={() => runAction('inv', () => api.debugInventoryScan(accountId))}
          >
            {busy === 'inv' ? 'Скан…' : 'Скан инвентаря (Dota + CS2 + Rust)'}
          </button>

          <button
            type="button"
            className="btn"
            disabled={!!busy}
            onClick={() => runAction('orders', () => api.debugMarketOrders(accountId))}
          >
            {busy === 'orders' ? 'Запрос…' : 'Мои ордера и лоты'}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy}
            onClick={() => runAction('selltick', () => api.debugSellTick(accountId))}
          >
            {busy === 'selltick' ? 'Тик…' : 'Тест тика продажи'}
          </button>

          <div className="debug-buy-block">
            <label className="field-label">
              <span>market_hash_name</span>
              <input
                type="text"
                value={buyName}
                onChange={(e) => setBuyName(e.target.value)}
              />
            </label>
            <label className="field-label">
              <span>Цена ордера, ₽</span>
              <input
                type="number"
                step="0.01"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
              />
            </label>
            <label className="field-label">
              <span>Количество</span>
              <input
                type="number"
                min="1"
                value={buyQty}
                onChange={(e) => setBuyQty(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn border-amber-500/40 text-amber-200"
              disabled={!!busy}
              onClick={() =>
                runAction('buy', () =>
                  api.debugTestBuyOrder(accountId, {
                    marketHashName: buyName,
                    price: Number(buyPrice),
                    quantity: Number(buyQty) || 1,
                  })
                )
              }
            >
              {busy === 'buy' ? 'Отправка…' : 'Тест buy-ордера'}
            </button>
            <p className="text-xs text-white/35">
              Игнорирует Dry run. Может реально поставить ордер.
            </p>
          </div>
        </div>
        {err && <p className="error mt-3">{err}</p>}
      </GlassCard>

      <div className="actions mb-4">
        <button type="button" className="btn" onClick={() => loadEvents(true)}>
          Обновить
        </button>
        <label className="flex items-center gap-2 text-sm text-white/50">
          <input
            type="checkbox"
            checked={paused}
            onChange={(e) => setPaused(e.target.checked)}
          />
          Пауза авто-обновления
        </label>
        <button
          type="button"
          className="btn flex items-center gap-2 border-red-500/30 text-red-300 hover:bg-red-500/10"
          onClick={clear}
        >
          <Trash2 className="h-4 w-4" />
          Очистить лог
        </button>
      </div>

      {events.length === 0 ? (
        <GlassCard className="py-16 text-center text-sm text-white/40">
          Пусто. Нажми кнопку проверки выше.
        </GlassCard>
      ) : (
        <div className="debug-log-list">
          {events.map((ev) => (
            <GlassCard key={ev.id} className="debug-log-item mb-3 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-white/30">#{ev.id}</span>
                <span className={ev.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {ev.ok ? 'OK' : 'ERR'}
                </span>
                <span className="font-mono text-cyan-300/80">{ev.step}</span>
                {ev.account_id && <span className="text-white/40">{ev.account_id}</span>}
                <span className="text-white/30">{ev.created_at}</span>
              </div>
              {ev.market_hash_name && (
                <p className="mb-1 text-sm text-white/60">{ev.market_hash_name}</p>
              )}
              {ev.error && <p className="error text-sm">{ev.error}</p>}
              {ev.detail && (
                <pre className="debug-log-detail">{fmtDetail(ev.detail)}</pre>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}
