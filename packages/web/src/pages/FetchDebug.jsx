import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

const STEP_LABELS = {
  scan_page: 'Поиск на маркете',
  scan_empty: 'Пустая страница',
  item_selected: 'Выбран лот',
  search_render_price: 'Цена sell (search/render)',
  listing_page_buy: 'Цена buy (/market/orderbook)',
  fetch_start: 'Старт fetch',
  cache_hit: 'Кэш (без запросов)',
  nameid_db: 'item_nameid из БД',
  nameid_resolve: 'Очередь: пакет nameid',
  nameid_probe_batch: 'Итог: nameid (параллельно)',
  histogram_probe_batch: 'Итог: ордербук (параллельно)',
  steam_market: 'steam-market listings',
  http_listing: 'HTTP страница лота',
  http_listing_en: 'HTTP лот ?l=english',
  http_listing_ru: 'HTTP лот ?l=russian',
  http_render: 'HTTP render JSON',
  http_render_ru10: 'HTTP render RU count=10',
  http_render_en10: 'HTTP render EN count=10',
  http_render_sid: 'HTTP render + sessionid',
  http_render_ru10_sid: 'HTTP render RU10 + sessionid',
  http_search: 'HTTP поиск по имени',
  community_listing: 'community HTML лота',
  community_render: 'community render JSON',
  playwright_listing: 'Playwright (браузер + cookies)',
  playwright_histogram: 'Playwright перехватил ордербук',
  http_histogram_ru: 'histogram RU currency=5',
  http_histogram_us: 'histogram US currency=1',
  community_histogram_ru: 'community histogram RU',
  steam_market_hist: 'steam-market histogram',
  listing: 'HTML страницы лота (legacy)',
  render: 'render API (legacy)',
  histogram: 'Ордербук (legacy)',
  community: 'community (legacy)',
  priceoverview: 'Ликвидность (volume за 24ч)',
  pricehistory: 'История продаж (устар.)',
  fetch_done: 'Цены получены',
  fetch_fail: 'Ошибка fetch',
};

function groupTraces(events) {
  const byId = new Map();
  const sorted = [...events].sort((a, b) => a.id - b.id);
  for (const e of sorted) {
    if (!byId.has(e.trace_id)) {
      byId.set(e.trace_id, {
        traceId: e.trace_id,
        accountId: e.account_id,
        appId: e.app_id,
        item: e.market_hash_name,
        startedAt: e.created_at,
        steps: [],
      });
    }
    const g = byId.get(e.trace_id);
    g.steps.push(e);
    if (e.market_hash_name) g.item = e.market_hash_name;
    if (e.account_id) g.accountId = e.account_id;
    if (e.app_id) g.appId = e.app_id;
  }
  return [...byId.values()].reverse();
}

function StepRow({ step }) {
  const label = STEP_LABELS[step.step] || step.step;
  const failed = !step.ok;

  return (
    <li
      className={`rounded-lg border px-3 py-2 text-xs ${
        failed
          ? 'border-red-500/40 bg-red-500/10'
          : 'border-emerald-500/30 bg-emerald-500/5'
      }`}
    >
      <div className="flex items-start gap-2">
        {failed ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white/90">{label}</span>
            <span className="font-mono text-[10px] text-white/35">{step.step}</span>
            {step.ms != null && (
              <span className="text-[10px] text-white/40">{step.ms} ms</span>
            )}
            <span className="text-[10px] text-white/40">
              {new Date(step.created_at).toLocaleTimeString('ru')}
            </span>
          </div>
          {step.itemNameId && (
            <p className="mt-0.5 font-mono text-cyan-300/90">nameid: {step.itemNameId}</p>
          )}
          {step.error && (
            <p className="mt-1 font-mono text-red-300 break-words">{step.error}</p>
          )}
          {step.detail && (
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/30 p-2 font-mono text-[10px] text-white/50">
              {JSON.stringify(step.detail, null, 2)}
            </pre>
          )}
          {!step.detail && step.meta?.results && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[10px] text-white/60">
                <thead>
                  <tr className="text-left text-white/40">
                    <th className="pr-2">стратегия</th>
                    <th className="pr-2">ok</th>
                    <th className="pr-2">ms</th>
                    <th>ошибка / nameid</th>
                  </tr>
                </thead>
                <tbody>
                  {step.meta.results.map((r) => (
                    <tr key={r.id} className={r.ok ? 'text-emerald-400/90' : 'text-red-300/80'}>
                      <td className="pr-2 font-mono">{r.id}</td>
                      <td className="pr-2">{r.ok ? '✓' : '✗'}</td>
                      <td className="pr-2">{r.ms ?? '—'}</td>
                      <td className="break-words">{r.nameid || r.err || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!step.detail && step.meta && !step.meta.results && (
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/30 p-2 font-mono text-[10px] text-white/50">
              {JSON.stringify(step.meta, null, 2)}
            </pre>
          )}
          {!step.detail && step.meta?.results && step.meta.winner != null && (
            <p className="mt-1 text-[10px] text-cyan-300/80">
              победитель: {step.meta.winner || 'нет'}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default function FetchDebug() {
  const [events, setEvents] = useState([]);
  const [maxId, setMaxId] = useState(0);
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef(null);

  const mergeEvents = useCallback((incoming, replace = false) => {
    setEvents((prev) => {
      const base = replace ? [] : prev;
      const map = new Map(base.map((e) => [e.id, e]));
      for (const e of incoming) map.set(e.id, e);
      const merged = [...map.values()].sort((a, b) => a.id - b.id);
      const last = merged.length ? merged[merged.length - 1].id : 0;
      setMaxId((m) => Math.max(m, last));
      return merged.slice(-1200);
    });
  }, []);

  const loadInitial = useCallback(() => {
    api
      .getFetchDebug({ limit: 400 })
      .then((rows) => mergeEvents(rows, true))
      .catch(console.error);
  }, [mergeEvents]);

  const poll = useCallback(() => {
    if (paused) return;
    const since = maxId;
    api
      .getFetchDebug(since > 0 ? { sinceId: since, limit: 200 } : { limit: 400 })
      .then((rows) => {
        if (!rows.length) return;
        mergeEvents(rows, since === 0);
      })
      .catch(console.error);
  }, [maxId, mergeEvents, paused]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, [poll]);

  const traces = useMemo(() => groupTraces(events), [events]);

  const clear = () => {
    api.clearFetchDebug().then(() => {
      setEvents([]);
      setMaxId(0);
    });
  };

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Отладка fetch</span>
        <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-normal text-amber-300">
          временно
        </span>
      </h1>

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <p>
          Скан: <code className="text-amber-200">scan_page</code> →{' '}
          <code className="text-amber-200">search/render</code> →{' '}
          <code className="text-amber-200">search_render_price</code> (только sell, buy пока пустой).
        </p>
      </div>

      <div className="actions mb-6">
        <button type="button" className="btn" onClick={loadInitial}>
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

      <div className="flex flex-col gap-4">
        {traces.map((t) => (
          <GlassCard key={t.traceId} className="p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="text-white/40">
                {new Date(t.startedAt).toLocaleString('ru')}
              </span>
              <span className="text-cyan-400/90">{t.accountId || '—'}</span>
              {t.item && (
                <span className="max-w-[min(100%,480px)] truncate font-medium" title={t.item}>
                  {t.item}
                </span>
              )}
              <span className="font-mono text-[10px] text-white/25" title={t.traceId}>
                {t.traceId}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {t.steps.map((s) => (
                <StepRow key={s.id} step={s} />
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>

      {traces.length === 0 && (
        <GlassCard className="py-12 text-center text-sm text-white/40">
          Пока нет событий. Запустите поиск — увидите пакет параллельных стратегий.
        </GlassCard>
      )}

      <div ref={bottomRef} />
    </>
  );
}
