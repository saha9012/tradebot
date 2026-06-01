const { evaluateBuy } = require('./dotaStrategy');
const { DEFAULT_STRATEGY } = require('./defaults');

function evaluate(game, config, item) {
  switch (game) {
    case 'dota':
      return evaluateBuy(config, item);
    case 'cs2':
    case 'rust':
      if (!config.enabled) {
        return { action: 'skip', reason: 'lane_disabled', marketHashName: item.marketHashName };
      }
      return evaluateBuy({ ...DEFAULT_STRATEGY[game], ...config }, item);
    default:
      return { action: 'skip', reason: 'unknown_game', marketHashName: item.marketHashName };
  }
}

module.exports = { evaluate };
