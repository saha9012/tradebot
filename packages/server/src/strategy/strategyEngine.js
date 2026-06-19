const { evaluateBuy } = require('./dotaStrategy');
const { checkCs2ItemAllowed, cs2FilterSkip } = require('./cs2Filters');

function evaluate(game, config, item) {
  switch (game) {
    case 'cs2': {
      const filter = checkCs2ItemAllowed(config, item.marketHashName);
      if (!filter.allowed) {
        return cs2FilterSkip(item.marketHashName, filter);
      }
      return evaluateBuy(config, item);
    }
    case 'dota':
    case 'rust':
      return evaluateBuy(config, item);
    default:
      return { action: 'skip', reason: 'unknown_game', marketHashName: item.marketHashName };
  }
}

module.exports = { evaluate };
