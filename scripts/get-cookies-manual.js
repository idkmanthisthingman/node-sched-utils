/**
 * Creates X_COOKIES from manually copied Safari cookie values.
 * Usage:
 *   AUTH_TOKEN="..." CT0="..." TWID="..." KDT="..." node scripts/get-cookies-manual.js
 *
 * Find all values in Safari → Develop → Web Inspector → Storage → Cookies → twitter.com
 */
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { AUTH_TOKEN, CT0, TWID, KDT } = process.env;

if (!AUTH_TOKEN || !CT0) {
  console.error('Required: AUTH_TOKEN and CT0 env vars.');
  console.error('Find them in Safari → Develop → Web Inspector → Storage → Cookies → twitter.com');
  process.exit(1);
}

const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

const cookies = [
  { key: 'auth_token', value: AUTH_TOKEN, domain: '.twitter.com', path: '/', secure: true, httpOnly: true,  sameSite: 'None',   expires: oneYear },
  { key: 'ct0',        value: CT0,        domain: '.twitter.com', path: '/', secure: true, httpOnly: false, sameSite: 'Lax',    expires: oneYear },
  ...(TWID ? [{ key: 'twid', value: TWID, domain: '.twitter.com', path: '/', secure: true, httpOnly: false, sameSite: 'None', expires: oneYear }] : []),
  ...(KDT  ? [{ key: 'kdt',  value: KDT,  domain: '.twitter.com', path: '/', secure: true, httpOnly: true,  sameSite: 'Lax',  expires: oneYear }] : []),
];

const outPath = join(__dirname, '..', 'state', 'cookies.json');
writeFileSync(outPath, JSON.stringify(cookies, null, 2));
console.log(`Saved ${cookies.length} cookies to ${outPath}`);

console.log('\n=== COPY THIS AS YOUR X_COOKIES SECRET ===\n');
console.log(JSON.stringify(cookies));
console.log('\n==========================================\n');
console.log('Cookies included:');
cookies.forEach(c => console.log(`  ✓ ${c.key}`));
