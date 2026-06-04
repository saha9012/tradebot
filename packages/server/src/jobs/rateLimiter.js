/**
 * Global Steam API rate limiter (per IP).
 * ~1 request / 4s with jitter to avoid 429.
 */
class RateLimiter {
  constructor({ minDelayMs = 4000, jitterMs = 2000 } = {}) {
    this.minDelayMs = minDelayMs;
    this.jitterMs = jitterMs;
    this.queue = Promise.resolve();
    this.pausedUntil = 0;
    this.paused = false;
  }

  pause(ms = 300_000) {
    this.pausedUntil = Date.now() + ms;
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.pausedUntil = 0;
  }

  isPaused() {
    return this.paused && Date.now() < this.pausedUntil;
  }

  schedule(fn) {
    const run = async () => {
      const wait = this.pausedUntil - Date.now();
      if (wait > 0) await sleep(wait);

      const jitter = Math.floor(Math.random() * this.jitterMs);
      await sleep(this.minDelayMs + jitter);

      try {
        return await fn();
      } catch (err) {
        const msg = String(err?.message || err);
        if (msg.includes('429') || msg.includes('Too many')) {
          this.pause();
          throw new Error('Rate limited (429) — pausing 5 min');
        }
        if (
          err?.code === 'ECONNRESET' ||
          msg.includes('ECONNRESET') ||
          msg.includes('socket hang up')
        ) {
          await sleep(3000);
        }
        throw err;
      }
    };

    const result = this.queue.then(run, run);
    this.queue = result.then(() => {}, () => {});
    return result;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { RateLimiter };
