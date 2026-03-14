import { Scraper } from 'agent-twitter-client';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = join(__dirname, '..', 'state', 'cookies.json');

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomJitter(baseMs, rangeMs) {
  return baseMs + Math.floor(Math.random() * rangeMs);
}

async function loadCookies(scraper) {
  if (!existsSync(COOKIES_PATH)) return false;
  try {
    const cookies = JSON.parse(readFileSync(COOKIES_PATH, 'utf-8'));
    await scraper.setCookies(cookies);
    if (await scraper.isLoggedIn()) {
      console.log('Restored session from cached cookies.');
      return true;
    }
    console.log('Cached cookies expired, will re-login.');
    return false;
  } catch {
    return false;
  }
}

export async function saveCookies(scraper) {
  const cookies = await scraper.getCookies();
  writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log('Cookies saved.');
}

export async function createAuthenticatedScraper() {
  const scraper = new Scraper();
  const restored = await loadCookies(scraper);
  if (!restored) {
    const username = process.env.X_USERNAME;
    const password = process.env.X_PASSWORD;
    const email = process.env.X_EMAIL;

    if (!username || !password) {
      console.error('Missing X_USERNAME or X_PASSWORD environment variables.');
      process.exit(1);
    }

    console.log(`Logging in as @${username}...`);
    await scraper.login(username, password, email);

    if (!(await scraper.isLoggedIn())) {
      console.error('Login failed. Check credentials or handle 2FA.');
      process.exit(1);
    }

    console.log('Login successful.');
    await saveCookies(scraper);
  }
  return scraper;
}
