'use strict';

const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'output');
const dataDir   = path.join(__dirname, 'docs', 'data');

fs.mkdirSync(dataDir, { recursive: true });

const files = fs.existsSync(outputDir)
  ? fs.readdirSync(outputDir).filter(f => /^army-lists-.+-latest\.json$/.test(f))
  : [];

for (const file of files) {
  fs.copyFileSync(path.join(outputDir, file), path.join(dataDir, file));
  console.log(`Copied ${file}`);
}

fs.writeFileSync(
  path.join(dataDir, 'manifest.json'),
  JSON.stringify({ generated: new Date().toISOString(), files }, null, 2),
);

console.log(`Build complete: ${files.length} data file(s) → docs/data/`);
