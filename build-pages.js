'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_MODEL: MODEL_ID, MAX_TOKENS } = require('./config');

const rootDir   = __dirname;
const outputDir = path.join(rootDir, 'output');
const docsDir   = path.join(rootDir, 'docs');
const dataDir   = path.join(docsDir, 'data');
const sharedDir = path.join(rootDir, 'shared');

// Read a shared CommonJS module and strip the Node-only lines (require(),
// module.exports guard, redundant 'use strict') so the remaining source can be
// inlined into the browser page as plain script-scope declarations.
function inlineModule(file) {
  const src = fs.readFileSync(path.join(sharedDir, file), 'utf-8');
  return src
    .split('\n')
    .filter((line) => {
      if (/^'use strict';\s*$/.test(line)) return false;
      if (/=\s*require\(/.test(line)) return false;
      if (/typeof module !== 'undefined'/.test(line)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

// Dependency order matters: factions before prompt (prompt references
// SUPPORTED_FACTIONS), format before list-summary and prompt (they use esc /
// editionLabel / formatSources), and getMockData/format before the UI code.
function buildSharedBundle() {
  return ['factions.js', 'mock-data.js', 'format.js', 'list-summary.js', 'prompt.js']
    .map((f) => `// ── shared/${f} ──\n${inlineModule(f)}`)
    .join('\n\n');
}

// The docs page's own UI code lives in docs/index.app.js (so ESLint can see
// it) and is inlined after the shared bundle, same stripping rules.
function buildPageScript() {
  const src = fs.readFileSync(path.join(docsDir, 'index.app.js'), 'utf-8');
  return src
    .split('\n')
    .filter((line) => !/^'use strict';\s*$/.test(line))
    .join('\n')
    .trim();
}

// Pure: produce the docs/index.html contents (no disk write) so it can be tested.
function renderIndexHtml() {
  const template = fs.readFileSync(path.join(docsDir, 'index.template.html'), 'utf-8');
  // Function replacers so `$` sequences in the inlined code (e.g. template
  // literals) are never interpreted as String.replace special patterns.
  return template
    .replace('/*SHARED_STYLES*/', () => fs.readFileSync(path.join(sharedDir, 'styles.css'), 'utf-8').trim())
    .replace('<!--SHARED_MODULES-->', () => buildSharedBundle())
    .replace('<!--PAGE_SCRIPT-->', () => buildPageScript())
    .replace(/__MODEL_ID__/g, () => MODEL_ID)
    .replace(/__MAX_TOKENS__/g, () => String(MAX_TOKENS));
}

function generateIndexHtml() {
  fs.writeFileSync(path.join(docsDir, 'index.html'), renderIndexHtml());
  console.log('Generated docs/index.html from template + shared/ modules + docs/index.app.js');
}

function copyData() {
  fs.mkdirSync(dataDir, { recursive: true });
  const files = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir).filter((f) => /^army-lists-.+-latest\.json$/.test(f))
    : [];
  for (const file of files) {
    fs.copyFileSync(path.join(outputDir, file), path.join(dataDir, file));
    console.log(`Copied ${file}`);
  }
  fs.writeFileSync(
    path.join(dataDir, 'manifest.json'),
    JSON.stringify({ generated: new Date().toISOString(), files }, null, 2),
  );
  return files.length;
}

if (require.main === module) {
  generateIndexHtml();
  const count = copyData();
  console.log(`Build complete: docs/index.html + ${count} data file(s) → docs/`);
}

module.exports = { buildSharedBundle, renderIndexHtml, generateIndexHtml, copyData, MODEL_ID };
