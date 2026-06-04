import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../api/client';
import GlassCard from '../components/GlassCard';

export default function FetchDebug() {
  const [paused, setPaused] = useState(false);

  const clear = () => {
    api.clearFetchDebug().catch(console.error);
  };

  return (
    <>
      <h1 className="page-title">
        <span className="text-gradient">Отладка</span>
      </h1>

      <div className="actions mb-6">
        <button type="button" className="btn">
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

      <GlassCard className="py-16 text-center text-sm text-white/40">
        Пока пусто.
      </GlassCard>
    </>
  );
}
