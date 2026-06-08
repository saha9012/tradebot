import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, AlertOctagon, Sparkles, Search, Package } from 'lucide-react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState('');

  const load = () => api.getDashboard().then(setData).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const toggleScan = async () => {
    setLoading('scan');
    try {
      if (data?.runningScan) await api.botScanStop();
      else await api.botScanStart();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading('');
    }
  };

  const toggleSell = async () => {
    setLoading('sell');
    try {
      if (data?.runningSell) await api.botSellStop();
      else await api.botSellStart();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading('');
    }
  };

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="font-display text-lg text-white/50"
        >
          Загрузка…
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/60"
        >
          <Sparkles className="h-4 w-4 text-lime-300" />
          <span>Два режима — меньше нагрузки на Steam</span>
        </motion.div>
        <h1 className="page-title mb-0">
          <span className="text-gradient">Обзор</span>
        </h1>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <GlassCard title="Поиск на маркете (тяжёлый)" delay={0.05}>
          <p className="mb-4 text-sm text-white/45">
            Сканирует маркет, фильтрует по стратегии, выставляет ордера на покупку. Включай, когда нужен
            поиск лотов. ~1 раз в минуту, много запросов.
          </p>
          <div className="actions">
            <span className={`badge ${data.runningScan ? 'running' : 'stopped'}`}>
              {data.runningScan ? 'Поиск вкл' : 'Поиск выкл'}
            </span>
            <button
              type="button"
              className={`btn ${data.runningScan ? 'btn-danger' : 'btn-primary'}`}
              onClick={toggleScan}
              disabled={loading === 'scan'}
            >
              {data.runningScan ? <Square className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              {data.runningScan ? 'Стоп поиск' : 'Старт поиск'}
            </button>
          </div>
        </GlassCard>

        <GlassCard title="Продажа из инвентаря (лёгкий)" delay={0.1}>
          <p className="mb-4 text-sm text-white/45">
            Смотрит инвентарь: если есть предмет — цена как на маркете минус 0.01 ₽. Можно держать
            включённым почти всегда. Реже и меньше запросов.
          </p>
          <div className="actions">
            <span className={`badge ${data.runningSell ? 'running' : 'stopped'}`}>
              {data.runningSell ? 'Продажа вкл' : 'Продажа выкл'}
            </span>
            <button
              type="button"
              className={`btn ${data.runningSell ? 'btn-danger' : 'btn-primary'}`}
              onClick={toggleSell}
              disabled={loading === 'sell'}
            >
              {data.runningSell ? <Square className="h-4 w-4" /> : <Package className="h-4 w-4" />}
              {data.runningSell ? 'Стоп продажа' : 'Старт продажа'}
            </button>
          </div>
        </GlassCard>
      </div>

      <div className="actions mb-6">
        {data.emergencyStop && (
          <span className="badge" style={{ borderColor: '#f87171', color: '#f87171' }}>
            Авария
          </span>
        )}
        <button
          type="button"
          className="btn btn-danger"
          disabled={!!loading}
          onClick={async () => {
            setLoading('emergency');
            try {
              await api.botEmergencyStop();
              await load();
            } catch (e) {
              setError(e.message);
            } finally {
              setLoading('');
            }
          }}
        >
          <AlertOctagon className="h-4 w-4" />
          Аварийная остановка
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <GlassCard title="Кошелёк всего" delay={0.12}>
          <div className="stat-value text-gradient-lime">{data.totalWallet.toFixed(2)} ₽</div>
        </GlassCard>
        <GlassCard title="PnL сегодня / 7 дней" delay={0.14}>
          <div
            className="stat-value"
            style={{ color: data.pnlToday >= 0 ? '#34d399' : '#f87171' }}
          >
            {data.pnlToday >= 0 ? '+' : ''}
            {data.pnlToday.toFixed(2)} ₽
          </div>
          <div className="stat-label mt-2">7д: {(data.pnlWeek ?? 0).toFixed(2)} ₽</div>
        </GlassCard>
        <GlassCard title="Прибыль по инвентарю" delay={0.15}>
          <div
            className="stat-value"
            style={{
              color: (data.compareSummary?.projectedProfit ?? 0) >= 0 ? '#34d399' : '#f87171',
            }}
          >
            {(data.compareSummary?.projectedProfit ?? 0) >= 0 ? '+' : ''}
            {(data.compareSummary?.projectedProfit ?? 0).toFixed(2)} ₽
          </div>
          <div className="stat-label mt-2">
            {data.compareSummary?.salesCount ?? 0} в продаже · ср.{' '}
            {(data.compareSummary?.avgProfit ?? 0).toFixed(2)} ₽
          </div>
        </GlassCard>
        <GlassCard title="Аккаунты" delay={0.16}>
          <div className="stat-value">
            {data.accounts.filter((a) => a.enabled).length} / {data.accounts.length}
          </div>
        </GlassCard>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {data.accounts.map((acc, i) => (
          <GlassCard key={acc.id} title={`${acc.label} (${acc.game})`} delay={0.1 + i * 0.05}>
            <div className="stat-label">Баланс</div>
            <div className="font-display text-xl font-bold">{(acc.wallet_balance ?? 0).toFixed(2)} ₽</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="badge">{acc.status}</span>
              {acc.sessionActive ? (
                <span className="badge running">Steam онлайн</span>
              ) : acc.status !== 'offline' ? (
                <span className="badge" style={{ borderColor: '#fbbf24', color: '#fbbf24' }}>
                  нужен вход
                </span>
              ) : null}
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard title="Последние сделки" delay={0.2}>
        {data.recentTrades.length === 0 ? (
          <p className="text-sm text-white/40">Пока пусто.</p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Аккаунт</th>
                  <th>Действие</th>
                  <th>Предмет</th>
                  <th>Цена</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTrades.map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.created_at).toLocaleString('ru')}</td>
                    <td>{t.account_id}</td>
                    <td>
                      {t.action}
                      {t.dry_run ? ' (тест)' : ''}
                    </td>
                    <td className="max-w-[200px] truncate">{t.market_hash_name || '—'}</td>
                    <td>{t.price ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
      {error && <p className="error">{error}</p>}
    </>
  );
}
