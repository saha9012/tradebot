const https = require('https');
const zlib = require('zlib');

function httpGet(url, cookies = '') {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Cookie: cookies,
          Referer: 'https://steamcommunity.com/market/',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let buf = Buffer.concat(chunks);
          if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
          resolve({ status: res.statusCode, body: buf.toString('utf8') });
        });
      }
    ).on('error', reject);
  });
}

async function main() {
  const name = encodeURIComponent('Stoneclaw Scavengers Dire Towers');
  for (const label of ['render-no-format', 'render-json']) {
    const fmt = label === 'render-json' ? '&format=json' : '';
    const url = `https://steamcommunity.com/market/listings/570/${name}/render/?start=0&count=1&currency=5&language=english${fmt}`;
    const { status, body } = await httpGet(url);
    console.log('\n', label, 'status', status, 'len', body.length);
    const spread = body.match(/Market_LoadOrderSpread\s*\(\s*(\d+)/);
    console.log('item_nameid', spread?.[1] || null);
    try {
      const j = JSON.parse(body);
      console.log('json success', j.success);
    } catch {
      console.log('not json', body.slice(0, 80));
    }
  }
  const ov = await httpGet(
    `https://steamcommunity.com/market/priceoverview/?appid=570&currency=5&market_hash_name=${name}`
  );
  console.log('\npriceoverview', ov.body.slice(0, 120));
}

main().catch(console.error);
