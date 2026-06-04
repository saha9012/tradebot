const { getItemId, normalizeItemName } = require('../src/util/itemId');

const name = 'Demon Eater';
console.log('normalize', normalizeItemName(name));
console.log('id1', getItemId(name));
console.log('id2', getItemId('  demon eater!!! '));
console.log('same', getItemId(name) === getItemId('demon eater'));
