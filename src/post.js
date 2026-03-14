import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchImageForPost } from './images.js';
import { loadState, saveState, recordPostedTweetId } from './state.js';
import { sleep, randomJitter, createAuthenticatedScraper, saveCookies } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN === '1';

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
  const tweetId =
    result?.id_str ||
    result?.data?.create_tweet?.tweet_results?.result?.rest_id ||
    null;
  console.log(`Posted: "${post.text.slice(0, 80)}..." ${mediaData ? '(with image)' : '(text-only)'}${tweetId ? ` [id:${tweetId}]` : ''}`);
  return tweetId;
}

async function main() {
  const batchArg = process.argv.includes('--batch')
    ? process.argv[process.argv.indexOf('--batch') + 1]
    : 'morning';

  const indexArg = process.argv.includes('--index')
    ? parseInt(process.argv[process.argv.indexOf('--index') + 1], 10)
    : null;

  const batchFile = join(ROOT, 'state', `batch-${batchArg}.json`);
  if (!existsSync(batchFile)) {
    console.error(`No batch file found: ${batchFile}`);
    console.error('Run generate.js first: node src/generate.js --batch ' + batchArg);
    process.exit(1);
  }

  const allPosts = JSON.parse(readFileSync(batchFile, 'utf-8'));

  // --index N: post only that one tweet (no sleep). Used by per-tweet cron jobs.
  const posts = indexArg !== null ? [allPosts[indexArg]].filter(Boolean) : allPosts;

  if (indexArg !== null && posts.length === 0) {
    console.log(`No tweet at index ${indexArg} in ${batchArg} batch (has ${allPosts.length}). Skipping.`);
    process.exit(0);
  }

  console.log(`Posting ${posts.length} tweet(s) from ${batchArg} batch${indexArg !== null ? ` (index ${indexArg})` : ''}.`);

  if (DRY_RUN) {
    console.log('=== DRY RUN MODE ===');
    for (const post of posts) {
      await postTweet(null, post, false);
    }
    console.log('=== DRY RUN COMPLETE ===');
    return;
  }

  const scraper = await createAuthenticatedScraper();
  const state = loadState();

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const includeImage = Math.random() < 0.8; // 80% of posts get images

    try {
      const tweetId = await postTweet(scraper, post, includeImage);
      if (tweetId) {
        recordPostedTweetId(state, tweetId, post);
        saveState(state);
      }
    } catch (err) {
      console.error(`Failed to post: ${err.message}`);
      continue;
    }

    // Sleep only when posting all tweets in one run (no --index), skip after last
    if (indexArg === null && i < posts.length - 1) {
      const waitMs = randomJitter(30 * 60 * 1000, 15 * 60 * 1000); // 30-45 min
      console.log(`Waiting ${Math.round(waitMs / 60000)} minutes before next post...`);
      await sleep(waitMs);
    }
  }

  await saveCookies(scraper);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Posting failed:', err.message);
  process.exit(1);
});
