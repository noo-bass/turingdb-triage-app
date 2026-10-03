const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The triage graph ships as a TuringDB JSONL asset (assets/graph/*.jsonl)
config.resolver.assetExts.push('jsonl');

module.exports = config;
