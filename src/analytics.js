import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadState, saveState, updatePerformance } from './state.js';
import { createAuthenticatedScraper, saveCookies, sleep } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_FETCHES_PER_RUN = 20;

function computePatterns(postedTweets) {
  const tweetsWithData = postedTweets.filter((t) => t.metrics.last_fetched_at !== null);
  if (tweetsWithData.length < 2) return { topPatterns: [], weakPatterns: [] };

  const groups = { tone: {}, format: {}, trigger: {} };
  for (const tweet of tweetsWithData) {
    // Weighted: retweet = 2x, reply = 1.5x, like = 1x
    const engagement =
      (tweet.metrics.likes ?? 0) +
      (tweet.metrics.retweets ?? 0) * 2 +
      (tweet.metrics.replies ?? 0) * 1.5;

    const dims = {
      tone: tweet.tone,
      format: tweet.format,
      trigger: tweet.trigger,
    };

    for (const [dim, val] of Object.entries(dims)) {
      if (!val) continue;
      if (!groups[dim][val]) groups[dim][val] = { total: 0, count: 0 };
      groups[dim][val].total += engagement;
      groups[dim][val].count++;
    }
  }

  const results = [];
  for (const [dim, vals] of Object.entries(groups)) {
    for (const [val, stats] of Object.entries(vals)) {
      if (stats.count >= 2) {
        results.push({
          dimension: dim,
          value: val,
          avg_engagement: Math.round((stats.total / stats.count) * 10) / 10,
          sample_size: stats.count,
        });
      }
    }
  }

  results.sort((a, b) => b.avg_engagement - a.avg_engagement);
  const topPatterns = results.slice(0, 6);
  const weakPatterns = results.filter((p) => p.avg_engagement < 1).slice(0, 3);

  return { topPatterns, weakPatterns };
}

async function main() {
  const state = loadState();

  if (!state.posted_tweets || state.posted_tweets.length === 0) {
    console.log('No posted tweets to analyze yet. Skipping analytics.');
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would analyze ${state.posted_tweets.length} tweets for engagement metrics.`);
    const patterns = computePatterns(state.posted_tweets.filter((t) => t.metrics.likes > 0));
    console.log('[DRY RUN] Computed patterns:', JSON.stringify(patterns, null, 2));
    return;
  }

  const scraper = await createAuthenticatedScraper();

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourHoursAgo = now - 4 * 60 * 60 * 1000;

  const toFetch = state.posted_tweets
    .filter((t) => {
      if (!t.tweet_id) return false;
      if (new Date(t.posted_at).getTime() < sevenDaysAgo) return false;
      if (!t.metrics.last_fetched_at) return true;
      return new Date(t.metrics.last_fetched_at).getTime() < fourHoursAgo;
    })
    .slice(0, MAX_FETCHES_PER_RUN);

  console.log(`Fetching metrics for ${toFetch.length} tweets...`);

  for (const entry of toFetch) {
    try {
      const tweet = await scraper.getTweet(entry.tweet_id);
      if (tweet) {
        entry.metrics.likes = tweet.likes ?? 0;
        entry.metrics.retweets = tweet.retweets ?? 0;
        entry.metrics.replies = tweet.replies ?? 0;
        entry.metrics.views = tweet.views ?? 0;
        entry.metrics.last_fetched_at = new Date().toISOString();
        console.log(
          `  ${entry.tweet_id}: ${entry.metrics.likes}L ${entry.metrics.retweets}RT ${entry.metrics.replies}R`
        );
      }
    } catch (err) {
      console.warn(`  Could not fetch tweet ${entry.tweet_id}: ${err.message}`);
    }
    await sleep(2000);
  }

  const { topPatterns, weakPatterns } = computePatterns(state.posted_tweets);

  const recentWithData = state.posted_tweets.filter((t) => t.metrics.last_fetched_at);
  const avgEngagement =
    recentWithData.length > 0
      ? Math.round(
          (recentWithData.reduce(
            (sum, t) => sum + (t.metrics.likes ?? 0) + (t.metrics.retweets ?? 0),
            0
          ) /
            recentWithData.length) *
            10
        ) / 10
      : 0;

  let followerCount = state.performance?.follower_count ?? 0;
  try {
    const profile = await scraper.getProfile(process.env.X_USERNAME);
    followerCount = profile?.followersCount ?? followerCount;
  } catch (err) {
    console.warn(`Could not fetch follower count: ${err.message}`);
  }

  updatePerformance(state, {
    engagement_rate_7d: avgEngagement,
    follower_count: followerCount,
    top_performing_patterns: topPatterns,
    weak_patterns: weakPatterns,
    last_analyzed_at: new Date().toISOString(),
  });

  const topFormats = topPatterns.filter((p) => p.dimension === 'format').map((p) => p.value);
  if (topFormats.length > 0) state.content_library.proven_formats = topFormats;

  const topHooks = topPatterns
    .filter((p) => p.dimension === 'trigger')
    .map((p) => p.value);
  if (topHooks.length > 0) state.content_library.proven_hooks = topHooks;

  saveState(state);
  await saveCookies(scraper);

  console.log(`Analytics complete. Avg engagement: ${avgEngagement}, Followers: ${followerCount}`);
  if (topPatterns.length > 0) {
    console.log(
      'Top patterns:',
      topPatterns.map((p) => `${p.dimension}:${p.value}(${p.avg_engagement})`).join(', ')
    );
  }
}

main().catch((err) => {
  console.error('Analytics failed:', err.message);
  process.exit(1);
});
