const zlib = require('zlib');
const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
        resolve(buf.toString('utf8').slice(0, 120));
      });
    }).on('error', reject);
  });
}

const name = encodeURIComponent('Dead Reckoning Chest');
const url = `https://steamcommunity.com/market/listings/570/${name}/render/?start=0&count=1&currency=5&format=json`;
httpGet(url).then((s) => console.log(s)).catch((e) => console.error(e));
