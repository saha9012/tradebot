import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

export default function History() {
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    api.getTrades(100).then(setTrades).catch(console.error);
  }, []);

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Сделки</span>
      </h1>
      <GlassCard className="max-w-[min(100%,1200px)]">
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Время</th>
                <th>Аккаунт</th>
                <th>Игра</th>
                <th>Действие</th>
                <th>Предмет</th>
                <th>nameid</th>
                <th>Цена</th>
                <th>Прибыль</th>
                <th>Тест</th>
                <th>Лот</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td className="whitespace-nowrap">{new Date(t.created_at).toLocaleString('ru')}</td>
                  <td>{t.account_id}</td>
                  <td>{t.game}</td>
                  <td>{t.action}</td>
                  <td className="max-w-[160px] truncate" title={t.market_hash_name}>
                    {t.market_hash_name || '—'}
                  </td>
                  <td className="font-mono text-xs">{t.item_name_id || '—'}</td>
                  <td>{t.price ?? '—'}</td>
                  <td>{t.profit ?? '—'}</td>
                  <td>{t.dry_run ? 'да' : 'нет'}</td>
                  <td>
                    {t.listing_url ? (
                      <a
                        href={t.listing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                      >
                        Steam
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {trades.length === 0 && (
          <p className="py-4 text-sm text-white/40">Сделок пока нет.</p>
        )}
      </GlassCard>
    </>
  );
}
