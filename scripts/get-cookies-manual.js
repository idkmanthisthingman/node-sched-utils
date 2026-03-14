/**
 * Creates X_COOKIES from manually copied Safari cookie values.
 * Usage:
 *   AUTH_TOKEN="..." CT0="..." TWID="..." node scripts/get-cookies-manual.js
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { AUTH_TOKEN, CT0, TWID } = process.env;

if (!AUTH_TOKEN || !CT0) {
  console.error('Required: AUTH_TOKEN and CT0 env vars.');
  console.error('Find them in Safari → Develop → Web Inspector → Storage → Cookies → x.com');
  process.exit(1);
}

const now = new Date();
const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

const cookies = [
  { key: 'auth_token',  value: AUTH_TOKEN, domain: '.x.com', path: '/', secure: true, httpOnly: true,  expires: oneYear, sameSite: 'None' },
  { key: 'ct0',         value: CT0,        domain: '.x.com', path: '/', secure: true, httpOnly: false, expires: oneYear, sameSite: 'Lax'  },
  ...(TWID ? [{ key: 'twid', value: TWID, domain: '.x.com', path: '/', secure: true, httpOnly: false, expires: oneYear, sameSite: 'None' }] : []),
];

const outPath = join(__dirname, '..', 'state', 'cookies.json');
writeFileSync(outPath, JSON.stringify(cookies, null, 2));
console.log(`Saved to ${outPath}`);

console.log('\n=== COPY THIS AS YOUR X_COOKIES SECRET ===\n');
console.log(JSON.stringify(cookies));
console.log('\n==========================================\n');
