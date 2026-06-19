/** Синхронно с server/src/strategy/cs2ItemClassifier.js */
export const CS2_FILTER_GROUPS = [
  {
    title: 'Оружие и экипировка',
    items: [
      { key: 'knife', label: 'Ножи', hint: '★ Karambit, Bayonet и т.д.' },
      { key: 'gloves', label: 'Перчатки', hint: '★ Sport Gloves, Driver Gloves…' },
      { key: 'agent', label: 'Агенты', hint: 'Персонажи CT/T без оружия в названии' },
    ],
  },
  {
    title: 'Открываемое / расходники',
    items: [
      { key: 'case', label: 'Кейсы', hint: 'Revolution Case, Kilowatt Case…' },
      { key: 'key', label: 'Ключи', hint: 'Ключи от кейсов' },
      { key: 'capsule', label: 'Capsule / автографы', hint: 'Наборы стикеров, autograph capsule' },
      { key: 'container', label: 'Пакеты / контейнеры', hint: 'Souvenir Package и прочие package' },
      { key: 'souvenir_package', label: 'Souvenir Package', hint: 'Сувенирные наборы турниров' },
    ],
  },
  {
    title: 'Наклейки и декор',
    items: [
      { key: 'sticker', label: 'Стикеры', hint: 'Sticker | …' },
      { key: 'patch', label: 'Нашивки', hint: 'Patch | …' },
      { key: 'graffiti', label: 'Граффити', hint: 'Graffiti | …' },
      { key: 'charm', label: 'Charms', hint: 'Брелоки на оружие' },
    ],
  },
  {
    title: 'Прочее',
    items: [
      { key: 'music_kit', label: 'Music Kits', hint: 'Музыкальные наборы' },
      { key: 'pin', label: 'Значки', hint: 'Collectible Pins' },
      { key: 'tool', label: 'Инструменты', hint: 'Name Tag, Storage Unit…' },
      { key: 'pass', label: 'Пропуски', hint: 'Operation Pass и viewer pass' },
      { key: 'collectible', label: 'Коллекционное', hint: 'Промо-предметы, HL:Alyx и т.п.' },
      { key: 'other', label: 'Нераспознанное', hint: 'Всё, что не попало в категории скина' },
    ],
  },
];

export const DEFAULT_CS2_FILTERS = Object.fromEntries(
  CS2_FILTER_GROUPS.flatMap((g) => g.items).map((i) => [i.key, true])
);

export function mergeCs2Filters(saved) {
  return { ...DEFAULT_CS2_FILTERS, ...(saved || {}), weapon_skin: false };
}
