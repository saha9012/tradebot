import { useState } from 'react';
import { api } from '../api/client';
import FieldLabel from './FieldLabel';

const FIELDS = [
  {
    key: 'feePercent',
    label: 'Комиссия Steam, %',
    type: 'number',
    hint: 'Процент комиссии при расчёте прибыли. У Steam на маркете обычно ~5% платформе + ~10% игре ≈ 15% с продажи. В боте стоит 15% с запасом — так не переоценишь профит.',
  },
  {
    key: 'minProfitAbsolute',
    label: 'Мин. прибыль, ₽',
    type: 'number',
    step: '0.01',
    hint: 'Сделка только если чистая прибыль больше этой суммы (после комиссии). Например 0.10 ₽.',
  },
  {
    key: 'maxProfitPercent',
    label: 'Макс. прибыль, % (анти-скам)',
    type: 'number',
    hint: 'Если расчётная прибыль в % слишком высокая — не покупаем (часто ошибка цены или ловушка). По умолчанию 34%.',
  },
  {
    key: 'maxProfitPercentHighTier',
    label: 'Макс. прибыль, % (200–500₽)',
    type: 'number',
    hint: 'Для дорогих предметов (от 200 ₽) — ещё строже лимит прибыли, по умолчанию 24%. Для Dota с лимитом 200 ₽ редко срабатывает.',
  },
  {
    key: 'maxItemPrice',
    label: 'Макс. цена предмета, ₽',
    type: 'number',
    hint: 'Не покупать предметы дороже этой цены. Dota: 200 ₽, CS2/Rust: 500 ₽.',
  },
  {
    key: 'minLiquidity',
    label: 'Мин. продаж в сутки',
    type: 'number',
    hint: 'Минимум продаж за 24ч (volume из priceoverview Steam). Если меньше — пропуск.',
  },
];

/** Парами: ордер сверху, порог ликвидности снизу. */
const LIQUIDITY_ORDER_FIELDS = [
  {
    key: 'orderQtyMin',
    label: 'Ордер 1 (мин)',
    type: 'number',
    hint: 'Сколько штук в buy-ордере на 1-м тире. Пример: 40.',
  },
  {
    key: 'liquidityMin',
    label: 'Ликвидность мин',
    type: 'number',
    hint: 'Нижняя граница 1-го тира (продаж/сутки). Ниже — не покупаем. Пример: 25.',
  },
  {
    key: 'orderQtyMax',
    label: 'Ордер 2 (макс)',
    type: 'number',
    hint: 'Сколько штук в buy-ордере на 2-м тире (высокая ликвидность). Пример: 90.',
  },
  {
    key: 'liquidityMax',
    label: 'Ликвидность макс',
    type: 'number',
    hint: 'С этого значения и выше — ордер 2. Между мин и макс — ордер 1. Пример: 80.',
  },
];

const OTHER_FIELDS = [
  {
    key: 'undercutStep',
    label: 'Шаг перебива, ₽',
    type: 'number',
    step: '0.01',
    hint: 'На сколько ₽ перебивать конкурента: buy +0.01, sell −0.01 от лучшей цены.',
  },
];

const OPTIONAL_LIMIT_FIELDS = [
  {
    enableKey: 'balanceThresholdEnabled',
    key: 'balanceThreshold',
    label: 'Порог баланса, ₽',
    type: 'number',
    hint: 'Включи галочку: при балансе ≥ порога Dota-аккаунт не сканирует. Выключено — порог не действует.',
  },
  {
    enableKey: 'maxSpendPerDayEnabled',
    key: 'maxSpendPerDay',
    label: 'Макс. траты в день, ₽',
    type: 'number',
    hint: 'Включи галочку: лимит расходов на покупки за сутки. Выключено — без лимита.',
  },
];

const RELIST_FIELDS = [
  {
    key: 'relistMorning',
    label: 'Перевыставление: утро',
    type: 'time',
    hint: 'В это время бот обновит ордера/листинги (окно 1).',
  },
  {
    key: 'relistAfternoon',
    label: 'Перевыставление: день',
    type: 'time',
    hint: 'Второе окно перевыставления ордеров.',
  },
  {
    key: 'relistEvening',
    label: 'Перевыставление: вечер',
    type: 'time',
    hint: 'Третье окно перевыставления ордеров.',
  },
];

const STATUS_RU = {
  offline: 'не в сети',
  idle: 'готов',
  needs_login: 'нужен вход',
  logging_in: 'вход…',
  trading: 'торгует',
  error: 'ошибка',
  rate_limited: 'лимит Steam',
};

export default function AccountAccordion({ account, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(account.strategy || {});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.updateStrategy(account.id, config);
      setMsg('Сохранено');
      onUpdate();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(''), 2000);
    }
  };

  const login = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.login(account.id);
      onUpdate();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await api.logout(account.id);
      onUpdate();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async () => {
    await api.patchAccount(account.id, { enabled: !account.enabled });
    onUpdate();
  };

  const statusLabel = STATUS_RU[account.status] || account.status;

  return (
    <div className="glass accordion rounded-2xl">
      <div className="accordion-header" onClick={() => setOpen(!open)}>
        <div>
          <strong>{account.label}</strong>
          <span className="ml-2 text-sm text-white/45">
            {account.game.toUpperCase()}
          </span>
          <span className="badge" style={{ marginLeft: 8 }}>{statusLabel}</span>
          {account.sessionActive ? (
            <span className="badge running" style={{ marginLeft: 8 }}>
              Steam онлайн
            </span>
          ) : account.status !== 'offline' && account.status !== 'logging_in' ? (
            <span className="badge" style={{ marginLeft: 8, borderColor: '#fbbf24', color: '#fbbf24' }}>
              нужен вход
            </span>
          ) : null}
        </div>
        <span>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="accordion-body">
          <div className="mb-3 flex flex-wrap gap-4 text-sm text-white/45">
            <span>Кошелёк: {(account.wallet_balance ?? 0).toFixed(2)} ₽</span>
            <span>Ключи: {account.credentials_env}_* в .env</span>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={login} disabled={busy}>
              Войти в Steam
            </button>
            <button type="button" className="btn" onClick={logout} disabled={busy}>
              Выйти
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.refreshWallet(account.id);
                  onUpdate();
                } catch (e) {
                  setErr(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Обновить кошелёк
            </button>
            <button type="button" className="btn" onClick={toggleEnabled}>
              {account.enabled ? 'Отключить аккаунт' : 'Включить аккаунт'}
            </button>
            <label className="dry-run-toggle">
              <input
                type="checkbox"
                checked={!!config.dryRun}
                onChange={(e) => setConfig({ ...config, dryRun: e.target.checked })}
              />
              <span>Тестовый режим (Dry run)</span>
              <span
                className="hint-icon hint-icon-inline"
                tabIndex={0}
                aria-label="Без реальных покупок"
              >
                ?
                <span className="hint-tooltip" role="tooltip">
                  Включено: бот только пишет в лог «купил бы / продал бы», деньги не тратит. Сначала всегда держи включённым.
                </span>
              </span>
            </label>
          </div>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <FieldLabel key={f.key} label={f.label} hint={f.hint}>
                <input
                  type={f.type}
                  step={f.step}
                  value={config[f.key] ?? ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
              </FieldLabel>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/40">Ликвидность и объём ордера</p>
          <div className="form-liquidity-pairs">
            <div className="form-liquidity-pair">
              {LIQUIDITY_ORDER_FIELDS.slice(0, 2).map((f) => (
                <FieldLabel key={f.key} label={f.label} hint={f.hint}>
                  <input
                    type={f.type}
                    value={config[f.key] ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        [f.key]: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
              ))}
            </div>
            <div className="form-liquidity-pair">
              {LIQUIDITY_ORDER_FIELDS.slice(2, 4).map((f) => (
                <FieldLabel key={f.key} label={f.label} hint={f.hint}>
                  <input
                    type={f.type}
                    value={config[f.key] ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        [f.key]: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
              ))}
            </div>
          </div>
          <div className="form-grid">
            {OTHER_FIELDS.map((f) => (
              <FieldLabel key={f.key} label={f.label} hint={f.hint}>
                <input
                  type={f.type}
                  step={f.step}
                  value={config[f.key] ?? ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
              </FieldLabel>
            ))}
          </div>
          <div className="form-optional-limits">
            {OPTIONAL_LIMIT_FIELDS.map((f) => (
              <div key={f.key} className="form-optional-limit">
                <label className="form-limit-enable">
                  <input
                    type="checkbox"
                    checked={!!config[f.enableKey]}
                    onChange={(e) =>
                      setConfig({ ...config, [f.enableKey]: e.target.checked })
                    }
                  />
                </label>
                <FieldLabel label={f.label} hint={f.hint}>
                  <input
                    type={f.type}
                    value={config[f.key] ?? ''}
                    disabled={!config[f.enableKey]}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        [f.key]: Number(e.target.value),
                      })
                    }
                  />
                </FieldLabel>
              </div>
            ))}
          </div>
          <div className="form-grid">
            {RELIST_FIELDS.map((f) => (
              <FieldLabel key={f.key} label={f.label} hint={f.hint}>
                <input
                  type={f.type}
                  step={f.step}
                  value={config[f.key] ?? ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
              </FieldLabel>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              Сохранить настройки
            </button>
            {msg && <span className="text-sm text-emerald-400">{msg}</span>}
          </div>
          {err && <p className="error">{err}</p>}
          {account.last_error && <p className="error">Последняя ошибка: {account.last_error}</p>}
        </div>
      )}
    </div>
  );
}
