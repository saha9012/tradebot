/** Stub for future Waxpeer / Skinport / DMarket price comparison */
module.exports = {
  name: 'external',
  enabled: false,
  async getPrice() {
    throw new Error('External market providers not implemented yet');
  },
};
