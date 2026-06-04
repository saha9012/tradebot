const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  getDashboard: () => request('/dashboard'),
  getAccounts: () => request('/accounts'),
  getAccount: (id) => request(`/accounts/${id}`),
  updateStrategy: (id, config) =>
    request(`/accounts/${id}/strategy`, { method: 'PUT', body: JSON.stringify(config) }),
  patchAccount: (id, body) =>
    request(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  login: (id) => request(`/accounts/${id}/login`, { method: 'POST' }),
  logout: (id) => request(`/accounts/${id}/logout`, { method: 'POST' }),
  botStatus: () => request('/bot/status'),
  botScanStart: () => request('/bot/scan/start', { method: 'POST' }),
  botScanStop: () => request('/bot/scan/stop', { method: 'POST' }),
  botSellStart: () => request('/bot/sell/start', { method: 'POST' }),
  botSellStop: () => request('/bot/sell/stop', { method: 'POST' }),
  botStart: () => request('/bot/scan/start', { method: 'POST' }),
  botStop: () => request('/bot/stop', { method: 'POST' }),
  botEmergencyStop: () => request('/bot/emergency-stop', { method: 'POST' }),
  refreshWallet: (id) => request(`/accounts/${id}/refresh-wallet`, { method: 'POST' }),
  getMarketItem: (game, hashName) => request(`/market/${game}/${encodeURIComponent(hashName)}`),
  getTrades: (limit = 50) => request(`/trades?limit=${limit}`),
  getAnalytics: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/analytics?${q}`);
  },
  getLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/logs?${q}`);
  },
  clearLogs: (accountId) => {
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    return request(`/logs${q}`, { method: 'DELETE' });
  },
  getFetchDebug: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/debug/fetches?${q}`);
  },
  clearFetchDebug: () => request('/debug/fetches', { method: 'DELETE' }),
};
