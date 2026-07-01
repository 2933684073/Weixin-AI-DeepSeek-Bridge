'use strict';

const fs = require('fs');
const path = require('path');

function decodeQuotedValue(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const equalsAt = trimmed.indexOf('=');
  if (equalsAt === -1) {
    return null;
  }

  const key = trimmed.slice(0, equalsAt).trim();
  const value = trimmed.slice(equalsAt + 1).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  return { key, value: decodeQuotedValue(value) };
}

function loadEnvFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const override = Boolean(options.override);
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed && (override || process.env[parsed.key] === undefined)) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

function loadEnv(options = {}) {
  const rootDir = path.resolve(__dirname, '..');
  const envFile = process.env.ENV_FILE || path.join(rootDir, '.env');
  loadEnvFile(envFile, options);
}

module.exports = {
  loadEnv,
  loadEnvFile,
  parseEnvLine
};