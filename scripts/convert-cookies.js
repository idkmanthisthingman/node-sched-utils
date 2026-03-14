/**
 * Converts Cookie-Editor browser export → X_COOKIES secret format.
 *
 * Usage:
 *   1. Paste your Cookie-Editor JSON into scripts/browser-cookies.js
 *   2. node scripts/convert-cookies.js
 *   3. Copy the printed JSON and add as X_COOKIES secret on GitHub
 */
import { browserCookies } from './browser-cookies.js';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!browserCookies || browserCookies.length === 0) {
  console.error('No cookies found. Edit scripts/browser-cookies.js and paste your Cookie-Editor JSON export.');
  process.exit(1);
}

// Convert Cookie-Editor format → tough-cookie format (used by agent-twitter-client)
const converted = browserCookies.map((c) => ({
  key: c.name,
  value: c.value,
  domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
  path: c.path || '/',
  secure: c.secure ?? true,
  httpOnly: c.httpOnly ?? false,
  expires: c.expirationDate ? new Date(c.expirationDate * 1000).toISOString() : 'Infinity',
  sameSite: c.sameSite === 'no_restriction' ? 'None' : (c.sameSite || 'Lax'),
}));

const json = JSON.stringify(converted);

// Save locally too (so you can test scripts without GitHub Actions)
const outPath = join(__dirname, '..', 'state', 'cookies.json');
writeFileSync(outPath, JSON.stringify(converted, null, 2));
console.log(`Saved to ${outPath}`);

console.log('\n=== COPY THIS AS YOUR X_COOKIES SECRET ===\n');
console.log(json);
console.log('\n==========================================');
console.log('\nKey cookies present:');
['auth_token', 'ct0', 'twid'].forEach((name) => {
  const found = converted.find((c) => c.key === name);
  console.log(`  ${name}: ${found ? '✓ found' : '✗ MISSING'}`);
});
