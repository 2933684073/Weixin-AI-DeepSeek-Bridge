'use strict';

const fs = require('fs');
const path = require('path');
const { parseEnvLine } = require('./env');
const { getConfig } = require('./config');

function encodeEnvValue(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:@-]*$/.test(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function readEnvFile(filePath = getConfig().envFile) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed) {
      values[parsed.key] = parsed.value;
    }
  }
  return values;
}

function writeEnvUpdates(updates, filePath = getConfig().envFile) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    : [];
  const pending = { ...updates };
  const lines = existing.map((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || !Object.prototype.hasOwnProperty.call(pending, parsed.key)) {
      return line;
    }

    const value = pending[parsed.key];
    delete pending[parsed.key];
    return `${parsed.key}=${encodeEnvValue(value)}`;
  });

  for (const [key, value] of Object.entries(pending)) {
    lines.push(`${key}=${encodeEnvValue(value)}`);
  }

  fs.writeFileSync(filePath, `${lines.join('\n').replace(/\n+$/, '')}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });

  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = String(value ?? '');
  }
}

function maskSecret(value) {
  const text = String(value || '');
  if (!text) {
    return '';
  }
  if (text.length <= 10) {
    return `${text.slice(0, 2)}***`;
  }
  return `${text.slice(0, 6)}***${text.slice(-4)}`;
}

module.exports = {
  maskSecret,
  readEnvFile,
  writeEnvUpdates
};