'use strict';

// Army-list parsing + pre-flight summary. Single source of truth consumed by
// Node (utils.js re-exports the parsers; list-analyzer uses them for meta
// aggregation) and loaded by both front ends so they can show a live summary
// of the pasted list before an API call. Rendering lives in format.js.

// Points can be written as "pt"/"pts" or spelled out "point"/"Points". The
// official Games Workshop 40K app — the dominant export format for modern
// tournament lists — uses the spelled-out form, e.g. "Typhus (100 Points)".
const POINTS_UNIT = '(?:pts?|points?)';
const UNIT_REGEX = new RegExp(`^[•·\\-\\s]*(.+?)\\s*[([]\\s*(\\d+)\\s*${POINTS_UNIT}\\s*[\\])]`, 'gim');
const ALT_UNIT_REGEX = new RegExp(`^[•·\\-\\s]*(.+?)\\s{2,}\\.{0,}?\\s*(\\d{2,4})\\s*${POINTS_UNIT}\\s*$`, 'gim');

function parseUnitsFromText(text, maxNameLength) {
  if (!text) return [];
  const cap = maxNameLength || 80;
  const units = [];
  const seen = new Set();

  function collect(regex, cleanName) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const rawName = cleanName(m[1]);
      const pts = parseInt(m[2], 10);
      if (rawName && pts > 0 && rawName.length < cap) {
        const key = rawName + '|' + pts;
        if (!seen.has(key)) {
          seen.add(key);
          units.push({ name: rawName, points: pts });
        }
      }
    }
  }

  collect(UNIT_REGEX,     (s) => s.trim().replace(/^[x×]\d+\s+/i, '').replace(/\s*[-–:]\s*$/, ''));
  collect(ALT_UNIT_REGEX, (s) => s.trim().replace(/\.+$/, '').trim());

  return units;
}

function extractDetachment(text) {
  if (!text) return null;
  const m = text.match(/Detachment:\s*(.+?)(?:\n|$)/i) ||
            text.match(/Detachment\s*[-–:]\s*(.+?)(?:\n|$)/i);
  // The GW 40K app wraps header lines in "+ ... +", e.g.
  // "+ DETACHMENT: Plague Company +" — strip the trailing/leading decoration.
  return m ? m[1].replace(/\s*\+\s*$/, '').replace(/^\+\s*/, '').trim() : null;
}

// The declared game size, from headers like "+ TOTAL ARMY POINTS: 2000pts +"
// (GW app), "Total Points: 2000", or a first-line title "My Army (2000 Points)"
// (the GW app export's opening line). Reports the matched title line so
// summarizeList can exclude it from unit parsing (it would otherwise be
// counted as a 2000pt "unit").
function findDeclaredPoints(text) {
  let m = text.match(new RegExp(`total(?:\\s+army)?\\s+points?\\s*[-–:]?\\s*(\\d{3,5})\\s*${POINTS_UNIT}?`, 'i'));
  if (m) return { points: parseInt(m[1], 10), titleLine: null };
  const firstLine = text.split('\n').find((l) => l.trim()) || '';
  m = firstLine.match(new RegExp(`[([]\\s*(\\d{3,5})\\s*${POINTS_UNIT}\\s*[\\])]`, 'i'));
  if (m) return { points: parseInt(m[1], 10), titleLine: firstLine };
  return null;
}

function extractDeclaredPoints(text) {
  if (!text) return null;
  const found = findDeclaredPoints(text);
  return found ? found.points : null;
}

// Pre-flight summary of a pasted list: what the parser sees before any tokens
// are spent. Returns null when there is nothing meaningful to summarize.
function summarizeList(text) {
  if (!text || text.trim().length < 10) return null;

  const declared = findDeclaredPoints(text);
  const unitText = declared && declared.titleLine
    ? text.split('\n').filter((l) => l !== declared.titleLine).join('\n')
    : text;
  const units = parseUnitsFromText(unitText);
  const totalPoints = units.reduce((s, u) => s + u.points, 0);
  const detachment = extractDetachment(text);
  const declaredPoints = declared ? declared.points : null;
  const warnings = [];

  if (units.length === 0) {
    warnings.push('No units with points values detected — the analysis will be less accurate. Expected lines like "Plague Marines (100 Points)" or "[100pts]".');
  }
  if (!detachment) {
    warnings.push('No "Detachment:" line found — detachment analysis may be generic.');
  }
  if (declaredPoints && totalPoints > declaredPoints) {
    warnings.push(`Parsed units total ${totalPoints}pts — over the declared ${declaredPoints}pts.`);
  } else if (declaredPoints && totalPoints > 0 && totalPoints < declaredPoints) {
    warnings.push(`Parsed ${totalPoints}pts of the declared ${declaredPoints}pts — enhancements or some units may not have been counted.`);
  } else if (!declaredPoints && totalPoints > 2000) {
    warnings.push(`Parsed units total ${totalPoints}pts — over the standard 2000pt tournament size.`);
  }

  return { units, unitCount: units.length, totalPoints, detachment, declaredPoints, warnings };
}

// Export for Node; the whole line is stripped when inlined into the browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = { parseUnitsFromText, extractDetachment, extractDeclaredPoints, summarizeList }; }
