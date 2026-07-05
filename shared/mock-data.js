'use strict';

// Single source of truth for the synthetic "meta snapshot" fallback data.
// Consumed by Node (list-analyzer.js) and inlined into the static docs page by
// build-pages.js. Previously this existed in two places (this file + a
// trimmed, drifted copy inside docs/index.html).
const MOCK_DATA = {
  'death-guard-11ed': {
    note: 'Approximate 11th Edition meta — update when official data is crawled',
    meta: { faction: 'Death Guard', totalLists: 32, edition: '11ed', crawledAt: '2025-10-01T00:00:00.000Z', sources: {} },
    detachmentBreakdown: [
      { detachment: 'Plague Company', count: 16, percentage: '50.0' },
      { detachment: 'Contagion of Nurgle', count: 10, percentage: '31.3' },
      { detachment: 'Foetid Virion', count: 6, percentage: '18.8' },
    ],
    topUnitsByDetachment: {
      'Plague Company': [
        { name: 'Plague Marines', count: 14, frequency: '87.5' },
        { name: 'Daemon Prince of Nurgle', count: 12, frequency: '75.0' },
        { name: 'Poxwalkers', count: 10, frequency: '62.5' },
        { name: 'Bloat-drone', count: 9, frequency: '56.3' },
        { name: 'Foetid Bloat-drone', count: 8, frequency: '50.0' },
      ],
      'Contagion of Nurgle': [
        { name: 'Plague Marines', count: 9, frequency: '90.0' },
        { name: 'Lord of Contagion', count: 8, frequency: '80.0' },
        { name: 'Foetid Bloat-drone', count: 6, frequency: '60.0' },
      ],
      'Foetid Virion': [
        { name: 'Foetid Bloat-drone', count: 6, frequency: '100.0' },
        { name: 'Plague Marines', count: 5, frequency: '83.3' },
      ],
    },
    isMockData: true,
  },
  'death-guard-10ed': {
    meta: { faction: 'Death Guard', totalLists: 48, edition: '10ed', crawledAt: '2025-07-01T00:00:00.000Z', sources: {} },
    detachmentBreakdown: [
      { detachment: 'Plague Company', count: 28, percentage: '58.3' },
      { detachment: 'Inexorable Advance', count: 12, percentage: '25.0' },
      { detachment: 'Contagion of Nurgle', count: 8, percentage: '16.7' },
    ],
    topUnitsByDetachment: {
      'Plague Company': [
        { name: 'Plague Marines', count: 26, frequency: '92.9' },
        { name: 'Daemon Prince of Nurgle', count: 22, frequency: '78.6' },
        { name: 'Poxwalkers', count: 18, frequency: '64.3' },
        { name: 'Foetid Bloat-drone', count: 15, frequency: '53.6' },
        { name: 'Mortarion', count: 10, frequency: '35.7' },
      ],
      'Inexorable Advance': [
        { name: 'Plague Marines', count: 11, frequency: '91.7' },
        { name: 'Helbrute', count: 8, frequency: '66.7' },
        { name: 'Chaos Land Raider', count: 5, frequency: '41.7' },
      ],
    },
    isMockData: true,
  },
  'space-marines-11ed': {
    note: 'Approximate 11th Edition meta — update when official data is crawled',
    meta: { faction: 'Space Marines', totalLists: 38, edition: '11ed', crawledAt: '2025-10-01T00:00:00.000Z', sources: {} },
    detachmentBreakdown: [
      { detachment: 'Gladius Task Force', count: 18, percentage: '47.4' },
      { detachment: 'Stormlance Task Force', count: 12, percentage: '31.6' },
      { detachment: 'Ironstorm Spearhead', count: 8, percentage: '21.1' },
    ],
    topUnitsByDetachment: {
      'Gladius Task Force': [
        { name: 'Intercessors', count: 16, frequency: '88.9' },
        { name: 'Captain in Terminator Armour', count: 14, frequency: '77.8' },
        { name: 'Assault Intercessors', count: 13, frequency: '72.2' },
        { name: 'Redemptor Dreadnought', count: 11, frequency: '61.1' },
        { name: 'Gladiator Lancer', count: 9, frequency: '50.0' },
      ],
      'Stormlance Task Force': [
        { name: 'Outriders', count: 11, frequency: '91.7' },
        { name: 'Attack Bike Squad', count: 9, frequency: '75.0' },
        { name: 'Khan on Bike', count: 8, frequency: '66.7' },
      ],
      'Ironstorm Spearhead': [
        { name: 'Predator Annihilator', count: 7, frequency: '87.5' },
        { name: 'Vindicator', count: 6, frequency: '75.0' },
        { name: 'Whirlwind', count: 5, frequency: '62.5' },
      ],
    },
    isMockData: true,
  },
  'space-marines-10ed': {
    meta: { faction: 'Space Marines', totalLists: 52, edition: '10ed', crawledAt: '2025-07-01T00:00:00.000Z', sources: {} },
    detachmentBreakdown: [
      { detachment: 'Gladius Task Force', count: 24, percentage: '46.2' },
      { detachment: 'Firestorm Assault Force', count: 16, percentage: '30.8' },
      { detachment: 'Stormlance Task Force', count: 12, percentage: '23.1' },
    ],
    topUnitsByDetachment: {
      'Gladius Task Force': [
        { name: 'Intercessors', count: 22, frequency: '91.7' },
        { name: 'Assault Intercessors', count: 18, frequency: '75.0' },
        { name: 'Redemptor Dreadnought', count: 16, frequency: '66.7' },
        { name: 'Ballistus Dreadnought', count: 14, frequency: '58.3' },
      ],
      'Firestorm Assault Force': [
        { name: 'Infernus Squad', count: 15, frequency: '93.8' },
        { name: 'Aggressor Squad', count: 12, frequency: '75.0' },
        { name: 'Eliminators', count: 9, frequency: '56.3' },
      ],
    },
    isMockData: true,
  },
  'chaos-space-marines-11ed': {
    note: 'Approximate 11th Edition meta — update when official data is crawled',
    meta: { faction: 'Chaos Space Marines', totalLists: 29, edition: '11ed', crawledAt: '2025-10-01T00:00:00.000Z', sources: {} },
    detachmentBreakdown: [
      { detachment: 'Slaves to Darkness', count: 14, percentage: '48.3' },
      { detachment: 'Raiders from the Rift', count: 9, percentage: '31.0' },
      { detachment: 'Pactbound Zealots', count: 6, percentage: '20.7' },
    ],
    topUnitsByDetachment: {
      'Slaves to Darkness': [
        { name: 'Chaos Space Marines', count: 13, frequency: '92.9' },
        { name: 'Daemon Prince', count: 11, frequency: '78.6' },
        { name: 'Chaos Terminators', count: 9, frequency: '64.3' },
        { name: 'Chaos Predator', count: 7, frequency: '50.0' },
      ],
      'Raiders from the Rift': [
        { name: 'Chaos Space Marines', count: 8, frequency: '88.9' },
        { name: 'Raptors', count: 7, frequency: '77.8' },
        { name: 'Warptalons', count: 5, frequency: '55.6' },
      ],
    },
    isMockData: true,
  },
  'chaos-space-marines-10ed': {
    meta: { faction: 'Chaos Space Marines', totalLists: 36, edition: '10ed', crawledAt: '2025-07-01T00:00:00.000Z', sources: {} },
    detachmentBreakdown: [
      { detachment: 'Slaves to Darkness', count: 20, percentage: '55.6' },
      { detachment: 'Pactbound Zealots', count: 10, percentage: '27.8' },
      { detachment: 'Raiders from the Rift', count: 6, percentage: '16.7' },
    ],
    topUnitsByDetachment: {
      'Slaves to Darkness': [
        { name: 'Chaos Space Marines', count: 19, frequency: '95.0' },
        { name: 'Daemon Prince', count: 15, frequency: '75.0' },
        { name: 'Chaos Terminators', count: 13, frequency: '65.0' },
      ],
    },
    isMockData: true,
  },
  'orks-11ed': {
    note: 'Approximate 11th Edition meta — update when official data is crawled',
    meta: { faction: 'Orks', totalLists: 33, edition: '11ed', crawledAt: '2025-10-01T00:00:00.000Z', sources: {} },
    detachmentBreakdown: [
      { detachment: "Waaagh! Tribe", count: 16, percentage: '48.5' },
      { detachment: 'Bully Boyz', count: 10, percentage: '30.3' },
      { detachment: 'Dread Mob', count: 7, percentage: '21.2' },
    ],
    topUnitsByDetachment: {
      "Waaagh! Tribe": [
        { name: 'Boyz', count: 15, frequency: '93.8' },
        { name: 'Warboss', count: 14, frequency: '87.5' },
        { name: 'Nobz', count: 12, frequency: '75.0' },
        { name: 'Trukk', count: 10, frequency: '62.5' },
        { name: 'Warboss on Warbike', count: 8, frequency: '50.0' },
      ],
      'Bully Boyz': [
        { name: 'Mega Nobz', count: 9, frequency: '90.0' },
        { name: 'Warboss in Mega Armour', count: 8, frequency: '80.0' },
        { name: 'Boyz', count: 7, frequency: '70.0' },
      ],
    },
    isMockData: true,
  },
  'orks-10ed': {
    meta: { faction: 'Orks', totalLists: 41, edition: '10ed', crawledAt: '2025-07-01T00:00:00.000Z', sources: {} },
    detachmentBreakdown: [
      { detachment: 'Green Tide', count: 20, percentage: '48.8' },
      { detachment: "Waaagh! Tribe", count: 12, percentage: '29.3' },
      { detachment: 'Dread Mob', count: 9, percentage: '22.0' },
    ],
    topUnitsByDetachment: {
      'Green Tide': [
        { name: 'Boyz', count: 19, frequency: '95.0' },
        { name: 'Warboss', count: 16, frequency: '80.0' },
        { name: 'Gretchin', count: 14, frequency: '70.0' },
        { name: 'Nobz', count: 12, frequency: '60.0' },
      ],
    },
    isMockData: true,
  },
};

function getMockData(faction, edition) {
  const ed = edition || '11ed';
  return MOCK_DATA[`${faction}-${ed}`] || null;
}

// Export for Node; the whole line is stripped when inlined into the browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = { MOCK_DATA, getMockData }; }
