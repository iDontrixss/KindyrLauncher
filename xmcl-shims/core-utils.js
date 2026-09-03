"use strict";
const fs = require('fs');
const crypto = require('crypto');

async function exists(file) {
  try {
    await fs.promises.access(file);
    return true;
  } catch { return false; }
}

async function checksum(target, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(target);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function validateSha1(target, hash, strict = true) {
  if (!hash) return !strict;
  try {
    const calc = await checksum(target, 'sha1');
    return calc.toLowerCase() === String(hash).toLowerCase();
  } catch { return false; }
}

function isNotNull(v) {
  return v !== null && v !== undefined;
}

module.exports = { exists, validateSha1, checksum, isNotNull };
