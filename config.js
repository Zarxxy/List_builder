'use strict';

// Single place that reads config.json and applies fallbacks. Node modules
// require this instead of parsing config.json themselves (require('./config')
// resolves to this .js file, not the .json — the explicit extension differs).
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));

const DEFAULT_MODEL = (config.aiAnalysis && config.aiAnalysis.defaultModel) || 'claude-sonnet-4-6';
const MAX_TOKENS = (config.aiAnalysis && config.aiAnalysis.maxTokens) || 2000;

module.exports = { config, DEFAULT_MODEL, MAX_TOKENS };
