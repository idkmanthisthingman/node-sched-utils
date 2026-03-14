import { Scraper } from 'agent-twitter-client';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchImageForPost } from './images.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const COOKIES_PATH = join(ROOT, 'state', 'cookies.json');
const DRY_RUN = process.env.DRY_RUN === '1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomJitter(baseMs, rangeMs) {
  return baseMs + Math.floor(Math.random() * rangeMs);
}

async function loadCookies(scraper) {
  if (!existsSync(COOKIES_PATH)) return false;
  try {
    const raw = readFileSync(COOKIES_PATH, 'utf-8');
    const cookies = JSON.parse(raw);
    await scraper.setCookies(cookies);
    const loggedIn = await scraper.isLoggedIn();
    if (loggedIn) {
      console.log('Restored session from cached cookies.');
      return true;
    }
    console.log('Cached cookies expired, will re-login.');
    return false;
  } catch {
    return false;
  }
}

async function saveCookies(scraper) {
  const cookies = await scraper.getCookies();
  writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log('Cookies saved.');
}

async function login(scraper) {
  const username = process.env.X_USERNAME;
  const password = process.env.X_PASSWORD;
  const email = process.env.X_EMAIL;

  if (!username || !password) {
    console.error('Missing X_USERNAME or X_PASSWORD environment variables.');
    process.exit(1);
  }

  console.log(`Logging in as @${username}...`);
  await scraper.login(username, password, email);

  const loggedIn = await scraper.isLoggedIn();
  if (!loggedIn) {
    console.error('Login failed. Check credentials or handle 2FA.');
    process.exit(1);
  }

  console.log('Login successful.');
  await saveCookies(scraper);
}

async function postTweet(scraper, post, includeImage) {
  let mediaData;

  if (includeImage) {
    const image = await fetchImageForPost(post);
    if (image) {
      mediaData = [{ data: image.buffer, mediaType: image.mimeType }];
    }
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would post: "${post.text}"`);
    if (mediaData) console.log(`[DRY RUN] With image attached.`);
    return;
  }

  const result = await scraper.sendTweet(post.text, undefined, mediaData);
  console.log(`Posted: "${post.text.slice(0, 80)}..." ${mediaData ? '(with image)' : '(text-only)'}`);
  return result;
}

async function main() {
  const batchArg = process.argv.includes('--batch')
    ? process.argv[process.argv.indexOf('--batch') + 1]
    : 'morning';

  const batchFile = join(ROOT, 'state', `batch-${batchArg}.json`);
  if (!existsSync(batchFile)) {
    console.error(`No batch file found: ${batchFile}`);
    console.error('Run generate.js first: node src/generate.js --batch ' + batchArg);
    process.exit(1);
  }

  const posts = JSON.parse(readFileSync(batchFile, 'utf-8'));
  console.log(`Loaded ${posts.length} posts from ${batchArg} batch.`);

  if (DRY_RUN) {
    console.log('=== DRY RUN MODE ===');
    for (const post of posts) {
      await postTweet(null, post, false);
    }
    console.log('=== DRY RUN COMPLETE ===');
    return;
  }

  const scraper = new Scraper();

  // Try cached cookies first, fall back to login
  const restored = await loadCookies(scraper);
  if (!restored) await login(scraper);

  // Post with 30-45 min gaps between tweets
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const includeImage = Math.random() < 0.6; // 60% of posts get images per v4.1

    try {
      await postTweet(scraper, post, includeImage);
    } catch (err) {
      console.error(`Failed to post: ${err.message}`);
      continue;
    }

    // Wait between posts (skip after last one)
    if (i < posts.length - 1) {
      const waitMs = randomJitter(30 * 60 * 1000, 15 * 60 * 1000); // 30-45 min
      console.log(`Waiting ${Math.round(waitMs / 60000)} minutes before next post...`);
      await sleep(waitMs);
    }
  }

  // Save cookies for next run
  await saveCookies(scraper);
  console.log('Batch complete.');
}

main().catch((err) => {
  console.error('Posting failed:', err.message);
  process.exit(1);
});
