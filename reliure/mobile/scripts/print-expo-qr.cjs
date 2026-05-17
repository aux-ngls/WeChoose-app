#!/usr/bin/env node

const qrcode = require('qrcode-terminal');

const url = process.argv[2];

if (!url) {
  process.exit(0);
}

console.log('');
console.log(`==> QR Reliure: ${url}`);
console.log('');
qrcode.generate(url, { small: true });
console.log('');
