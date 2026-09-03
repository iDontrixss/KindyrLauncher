// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

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
