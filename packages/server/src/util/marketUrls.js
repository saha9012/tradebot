function marketListingUrl(appId, marketHashName) {
  return `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`;
}

module.exports = { marketListingUrl };
