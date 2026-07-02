'use strict';

// Single source of truth for the supported faction list. Consumed directly by
// Node (list-analyzer.js, mock-tournament-data.js) and inlined into the static
// docs page by build-pages.js. Keep this list in sync with config.json's
// factionPatterns and the crawl-deploy.yml workflow choices.
const SUPPORTED_FACTIONS = [
  { key: 'death-guard',         label: 'Death Guard' },
  { key: 'space-marines',       label: 'Space Marines' },
  { key: 'astra-militarum',     label: 'Astra Militarum' },
  { key: 'aeldari',             label: 'Aeldari' },
  { key: 'chaos-space-marines', label: 'Chaos Space Marines' },
  { key: 'orks',                label: 'Orks' },
  { key: 'tyranids',            label: 'Tyranids' },
  { key: 'necrons',             label: 'Necrons' },
  { key: 'tau-empire',          label: "T'au Empire" },
  { key: 'drukhari',            label: 'Drukhari' },
  { key: 'adeptus-mechanicus',  label: 'Adeptus Mechanicus' },
  { key: 'adeptus-custodes',    label: 'Adeptus Custodes' },
  { key: 'grey-knights',        label: 'Grey Knights' },
  { key: 'dark-angels',         label: 'Dark Angels' },
  { key: 'blood-angels',        label: 'Blood Angels' },
  { key: 'space-wolves',        label: 'Space Wolves' },
  { key: 'black-templars',      label: 'Black Templars' },
  { key: 'deathwatch',          label: 'Deathwatch' },
  { key: 'thousand-sons',       label: 'Thousand Sons' },
  { key: 'world-eaters',        label: 'World Eaters' },
  { key: 'chaos-daemons',       label: 'Chaos Daemons' },
  { key: 'imperial-knights',    label: 'Imperial Knights' },
  { key: 'chaos-knights',       label: 'Chaos Knights' },
  { key: 'leagues-of-votann',   label: 'Leagues of Votann' },
  { key: 'adepta-sororitas',    label: 'Adepta Sororitas' },
  { key: 'genestealer-cults',   label: 'Genestealer Cults' },
];

// Export for Node; the whole line is stripped when inlined into the browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = { SUPPORTED_FACTIONS }; }
