/** Relist windows: morning / afternoon / evening per account config */
class RelistScheduler {
  constructor(botEngine) {
    this.botEngine = botEngine;
    this.lastRun = new Map();
    this.interval = null;
  }

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.checkWindows().catch(console.error), 60_000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  parseTime(hhmm) {
    const [h, m] = (hhmm || '08:00').split(':').map(Number);
    return { h: h || 0, m: m || 0 };
  }

  isWindowNow(config, slot) {
    const key = slot === 'morning' ? 'relistMorning' : slot === 'afternoon' ? 'relistAfternoon' : 'relistEvening';
    const { h, m } = this.parseTime(config[key]);
    const now = new Date();
    return now.getHours() === h && now.getMinutes() === m;
  }

  async checkWindows() {
    if (!(await this.botEngine.isScanRunning())) return;

    const accounts = await this.botEngine.getEnabledAccounts();
    for (const acc of accounts) {
      const config = JSON.parse(acc.config_json);
      for (const slot of ['morning', 'afternoon', 'evening']) {
        if (!this.isWindowNow(config, slot)) continue;

        const runKey = `${acc.id}:${slot}:${new Date().toISOString().slice(0, 10)}`;
        if (this.lastRun.get(runKey)) continue;

        this.lastRun.set(runKey, true);
        await this.botEngine.runRelistWindow(acc, config, slot);
      }
    }
  }
}

module.exports = { RelistScheduler };
