import Groq from 'groq-sdk';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { sleep } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SYSTEM_PROMPT = readFileSync(join(ROOT, 'config', 'v4-system-prompt.md'), 'utf-8');
const REPLIES_PER_RUN = 2;
const MAX_DAILY_REPLIES = 5;

const NICHE_QUERIES = [
  'discipline gym motivation -is:retweet lang:en',
  'consistency self improvement -is:retweet lang:en',
  'fitness mindset sacrifice -is:retweet lang:en',
];

export async function replyToNichePosts(scraper, state, DRY_RUN = false) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.engagement.daily.date !== today) {
    state.engagement.daily = { date: today, follows: 0, likes: 0, retweets: 0, replies: 0 };
  }

  if (state.engagement.daily.replies >= MAX_DAILY_REPLIES) {
    console.log(`Daily reply limit reached (${MAX_DAILY_REPLIES}). Skipping.`);
    return;
  }

  const repliesLeft = Math.min(REPLIES_PER_RUN, MAX_DAILY_REPLIES - state.engagement.daily.replies);
  const username = process.env.X_USERNAME?.toLowerCase() ?? '';
  const repliedIds = new Set(state.engagement.replied_tweet_ids || []);

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const query = NICHE_QUERIES[Math.floor(Math.random() * NICHE_QUERIES.length)];

  let candidates = [];
  try {
    const { SearchMode } = await import('agent-twitter-client');
    for await (const tweet of scraper.searchTweets(query, 30, SearchMode.Latest)) {
      if (!tweet.id || !tweet.text) continue;
      if (repliedIds.has(tweet.id)) continue;
      if (tweet.username?.toLowerCase() === username) continue;
      if ((tweet.likes ?? 0) < 5) continue;
      if (tweet.text.length < 20) continue;
      candidates.push(tweet);
      if (candidates.length >= 10) break;
    }
  } catch (err) {
    console.warn(`Reply search failed: ${err.message}`);
    return;
  }

  if (candidates.length === 0) {
    console.log('No suitable tweets found to reply to.');
    return;
  }

  let repliesPosted = 0;
  for (const tweet of candidates) {
    if (repliesPosted >= repliesLeft) break;

    let replyText;
    try {
      const res = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `You see this tweet from someone else:\n"${tweet.text}"\n\nWrite a genuine, on-brand reply in 1-2 sentences. Rules: add real value, not promotional, don't start with "I" or "@", no hashtags, max 200 characters. Return ONLY the reply text.`,
          },
        ],
        temperature: 0.85,
        max_tokens: 128,
      });
      replyText = res.choices[0]?.message?.content?.trim();
    } catch (err) {
      console.warn(`Failed to generate reply: ${err.message}`);
      continue;
    }

    if (!replyText || replyText.length > 200 || replyText.length < 10) continue;

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would reply to @${tweet.username}: "${replyText}"`);
    } else {
      try {
        await scraper.sendTweet(replyText, tweet.id);
        console.log(`Replied to @${tweet.username}: "${replyText.slice(0, 60)}..."`);
      } catch (err) {
        console.warn(`Failed to post reply: ${err.message}`);
        continue;
      }
    }

    repliedIds.add(tweet.id);
    state.engagement.daily.replies++;
    repliesPosted++;

    await sleep(10000 + Math.floor(Math.random() * 5000)); // 10-15s between replies
  }

  state.engagement.replied_tweet_ids = [...repliedIds].slice(-100);
  console.log(`Posted ${repliesPosted} replies.`);
}
