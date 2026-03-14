import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, '..', 'state', 'agent-state.json');

export function loadState() {
  return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
}

export function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

export function recordPosts(state, posts) {
  for (const post of posts) {
    state.content.recent_posts.push({
      text: post.text,
      tone: post.tone,
      format: post.format,
      pillar: post.pillar,
      trigger: post.psychological_trigger,
      posted_at: new Date().toISOString(),
    });

    if (post.psychological_trigger) {
      state.content.recent_triggers_used.push(post.psychological_trigger);
    }
    if (post.hook_template_id) {
      state.content.recent_hooks.push(post.hook_template_id);
    }
    for (const p of post.pillar || []) {
      state.content.recent_topics.push(p);
    }

    // Update tone distribution
    if (post.tone && state.content.tone_distribution_7d[post.tone] !== undefined) {
      state.content.tone_distribution_7d[post.tone]++;
    }

    // Update format distribution
    if (post.format) {
      state.content.format_distribution_7d[post.format] =
        (state.content.format_distribution_7d[post.format] || 0) + 1;
    }
  }

  // Keep rolling windows manageable
  state.content.recent_posts = state.content.recent_posts.slice(-50);
  state.content.recent_triggers_used = state.content.recent_triggers_used.slice(-20);
  state.content.recent_hooks = state.content.recent_hooks.slice(-20);
  state.content.recent_topics = state.content.recent_topics.slice(-30);

  return state;
}

export function recordPostedTweetId(state, tweetId, post) {
  if (!state.posted_tweets) state.posted_tweets = [];
  state.posted_tweets.push({
    tweet_id: tweetId,
    text: post.text,
    tone: post.tone,
    format: post.format,
    pillar: post.pillar,
    trigger: post.psychological_trigger,
    posted_at: new Date().toISOString(),
    metrics: { likes: 0, retweets: 0, replies: 0, views: 0, last_fetched_at: null },
  });
  state.posted_tweets = state.posted_tweets.slice(-100);
}

export function updatePerformance(state, performanceData) {
  state.performance = { ...state.performance, ...performanceData };
}
