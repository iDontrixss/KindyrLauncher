'use strict';

function url() {
  return process.env.KINDYR_MEMLAB_URL || 'about:blank';
}

async function action() {}
async function back() {}

module.exports = { url, action, back };
