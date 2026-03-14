import { loadState, saveState } from './state.js';
import { createAuthenticatedScraper, saveCookies, sleep, randomJitter } from './auth.js';
import { replyToNichePosts } from './reply.js';

const DRY_RUN = process.env.DRY_RUN === '1';

const LIKES_PER_RUN = 8;
const FOLLOWS_PER_RUN = 5;
const RETWEETS_PER_RUN = 1;
const MAX_DAILY_LIKES = 25;
const MAX_DAILY_FOLLOWS = 15;
const MAX_DAILY_RETWEETS = 3;
const MIN_FOLLOWER_COUNT = 100; // don't follow obvious bots

const NICHE_QUERIES = [
  'discipline gym motivation -is:retweet lang:en',
  'consistency self improvement -is:retweet lang:en',
  'fitness mindset sacrifice -is:retweet lang:en',
];

function resetDailyIfNeeded(state) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.engagement.daily.date !== today) {
    state.engagement.daily = { date: today, follows: 0, likes: 0, retweets: 0, replies: 0 };
    console.log('Reset daily engagement counters for', today);
  }
}

async function main() {
  const state = loadState();
  resetDailyIfNeeded(state);

  const username = process.env.X_USERNAME?.toLowerCase() ?? '';
  const likedIds = new Set(state.engagement.liked_tweet_ids || []);
  const retweetedIds = new Set(state.engagement.retweeted_tweet_ids || []);
  const followedUsers = new Set(state.engagement.followed_users || []);

  const likesLeft = Math.min(LIKES_PER_RUN, MAX_DAILY_LIKES - state.engagement.daily.likes);
  const followsLeft = Math.min(FOLLOWS_PER_RUN, MAX_DAILY_FOLLOWS - state.engagement.daily.follows);
  const retweetsLeft = Math.min(RETWEETS_PER_RUN, MAX_DAILY_RETWEETS - state.engagement.daily.retweets);

  if (DRY_RUN) {
    console.log(`[DRY RUN] Engage budget: ${likesLeft} likes, ${followsLeft} follows, ${retweetsLeft} retweets`);
  }

  if (!DRY_RUN && likesLeft <= 0 && followsLeft <= 0 && retweetsLeft <= 0) {
    console.log('All daily engagement limits reached. Skipping like/follow/retweet.');
  } else {
    const scraper = await createAuthenticatedScraper();
    const { SearchMode } = await import('agent-twitter-client');

    const query = NICHE_QUERIES[Math.floor(Math.random() * NICHE_QUERIES.length)];
    console.log(`Searching niche tweets: "${query}"`);

    let searchResults = [];
    try {
      for await (const tweet of scraper.searchTweets(query, 50, SearchMode.Latest)) {
        if (!tweet.id || !tweet.text) continue;
        if (tweet.username?.toLowerCase() === username) continue;
        searchResults.push(tweet);
        if (searchResults.length >= 40) break;
      }
    } catch (err) {
      console.warn(`Search failed: ${err.message}`);
    }

    console.log(`Found ${searchResults.length} niche tweets.`);

    // LIKES
    let likesPosted = 0;
    for (const tweet of searchResults) {
      if (likesPosted >= likesLeft) break;
      if (likedIds.has(tweet.id)) continue;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would like tweet by @${tweet.username}: "${tweet.text?.slice(0, 60)}"`);
      } else {
        try {
          await scraper.likeTweet(tweet.id);
          console.log(`Liked @${tweet.username}: "${tweet.text?.slice(0, 60)}..."`);
        } catch (err) {
          console.warn(`Like failed: ${err.message}`);
          continue;
        }
        await sleep(randomJitter(3000, 5000)); // 3-8s between likes
      }

      likedIds.add(tweet.id);
      state.engagement.daily.likes++;
      likesPosted++;
    }

    // FOLLOWS
    let followsPosted = 0;
    const followCandidates = searchResults.filter(
      (t) =>
        t.username &&
        !followedUsers.has(t.username.toLowerCase()) &&
        (t.followersCount ?? 0) >= MIN_FOLLOWER_COUNT
    );

    for (const tweet of followCandidates) {
      if (followsPosted >= followsLeft) break;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would follow @${tweet.username} (${tweet.followersCount} followers)`);
      } else {
        try {
          await scraper.followUser(tweet.username);
          console.log(`Followed @${tweet.username} (${tweet.followersCount ?? '?'} followers)`);
        } catch (err) {
          console.warn(`Follow failed for @${tweet.username}: ${err.message}`);
          continue;
        }
        await sleep(randomJitter(5000, 5000)); // 5-10s between follows
      }

      followedUsers.add(tweet.username.toLowerCase());
      state.engagement.daily.follows++;
      followsPosted++;
    }

    // RETWEET
    if (retweetsLeft > 0) {
      const retweetCandidate = searchResults
        .filter((t) => !retweetedIds.has(t.id) && (t.likes ?? 0) >= 10)
        .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))[0];

      if (retweetCandidate) {
        if (DRY_RUN) {
          console.log(`[DRY RUN] Would retweet @${retweetCandidate.username}: "${retweetCandidate.text?.slice(0, 60)}"`);
        } else {
          try {
            await scraper.retweet(retweetCandidate.id);
            console.log(`Retweeted @${retweetCandidate.username}: "${retweetCandidate.text?.slice(0, 60)}..."`);
            retweetedIds.add(retweetCandidate.id);
            state.engagement.daily.retweets++;
          } catch (err) {
            console.warn(`Retweet failed: ${err.message}`);
          }
        }
      }
    }

    console.log(
      `Engagement done: ${likesPosted} likes, ${followsPosted} follows, ` +
        `${state.engagement.daily.retweets - (MAX_DAILY_RETWEETS - retweetsLeft)} retweets`
    );

    // REPLIES (run regardless of like/follow budget)
    await replyToNichePosts(scraper, state, DRY_RUN);

    await saveCookies(scraper);
  }

  // Persist updated sets
  state.engagement.liked_tweet_ids = [...likedIds].slice(-200);
  state.engagement.retweeted_tweet_ids = [...retweetedIds].slice(-100);
  state.engagement.followed_users = [...followedUsers].slice(-500);

  saveState(state);
  console.log('Engage complete.');
}

main().catch((err) => {
  console.error('Engage failed:', err.message);
  process.exit(1);
});
