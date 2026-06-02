const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const SteamCommunity = require('steamcommunity');

function loadCredentials(envPrefix) {
  const username = process.env[`${envPrefix}_USERNAME`];
  const password = process.env[`${envPrefix}_PASSWORD`];
  const sharedSecret = process.env[`${envPrefix}_SHARED_SECRET`];
  const identitySecret = process.env[`${envPrefix}_IDENTITY_SECRET`];

  if (!username || !password) {
    throw new Error(`Missing ${envPrefix}_USERNAME or ${envPrefix}_PASSWORD in .env`);
  }

  return { username, password, sharedSecret, identitySecret };
}

function createClient() {
  const client = new SteamUser({ autoRelogin: false, pingInterval: 30000 });
  client.on('error', (err) => {
    console.error('[steam-user]', err.message || err);
  });
  return client;
}

async function initMarket(client, cookies) {
  const { default: SteamMarket } = await import('steam-market');
  const market = new SteamMarket();
  market.setCookies(cookies);
  market.setCountry('RU');

  const vanity = client.vanityURL ?? client.steamID?.getSteamID64?.() ?? '';
  if (vanity) market.setVanityURL(String(vanity));

  return market;
}

function loginClient(client, credentials) {
  return new Promise((resolve, reject) => {
    const community = new SteamCommunity();
    let settled = false;

    const finish = (err, info) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(info);
    };

    const onLoggedOn = () => {
      client.setPersona(SteamUser.EPersonaState.Online);
    };

    const onWebSession = async (sessionID, cookies) => {
      community.setCookies(cookies);
      const cookieHeader = cookies.join('; ');

      let market = null;
      let marketError = null;
      try {
        market = await initMarket(client, cookies);
      } catch (e) {
        marketError = e.message;
      }

      finish(null, {
        steamId: client.steamID.getSteamID64(),
        accountName: client.accountInfo?.name || credentials.username,
        community,
        sessionID,
        cookieHeader,
        market,
        marketError,
      });
    };

    const onError = (err) => finish(err);

    const cleanup = () => {
      client.removeListener('loggedOn', onLoggedOn);
      client.removeListener('webSession', onWebSession);
      client.removeListener('error', onError);
    };

    client.on('loggedOn', onLoggedOn);
    client.on('webSession', onWebSession);
    client.on('error', onError);

    const logOnOptions = {
      accountName: credentials.username,
      password: credentials.password,
    };

    if (credentials.sharedSecret) {
      logOnOptions.twoFactorCode = SteamTotp.generateAuthCode(credentials.sharedSecret);
    }

    client.logOn(logOnOptions);

    setTimeout(() => finish(new Error('Login timeout (no webSession)')), 60000);
  });
}

function logoutClient(client) {
  return new Promise((resolve) => {
    if (!client) return resolve();
    try {
      client.logOff();
    } catch {
      /* ignore */
    }
    setTimeout(resolve, 500);
  });
}

/** Баланс кошелька через steam-user (событие wallet), не steamcommunity. */
function getWalletBalance(client, timeoutMs = 10000) {
  if (client?.wallet?.hasWallet) {
    return Promise.resolve(client.wallet.balance);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeListener('wallet', onWallet);
      if (client.wallet?.hasWallet) resolve(client.wallet.balance);
      else reject(new Error('Кошелёк: Steam не прислал баланс (таймаут)'));
    }, timeoutMs);

    const onWallet = (hasWallet, _currency, balance) => {
      clearTimeout(timer);
      client.removeListener('wallet', onWallet);
      resolve(hasWallet ? balance : 0);
    };

    client.on('wallet', onWallet);
  });
}

module.exports = {
  loadCredentials,
  createClient,
  loginClient,
  logoutClient,
  getWalletBalance,
};
