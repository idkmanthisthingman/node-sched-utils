import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const systemPrompt = readFileSync(join(ROOT, 'config', 'v4-system-prompt.md'), 'utf-8');

const BATCH_CONFIG = {
  morning: {
    count: 3,
    pillars: ['discipline', 'gym'],
    tones: ['tough-love', 'motivational', 'empathetic'],
    triggers: ['identity_threat', 'relatability_gap', 'reframe'],
    formats: ['micro-lesson', 'micro-story', 'quote-style'],
  },
  afternoon: {
    count: 3,
    pillars: ['motivation', 'life', 'consistency'],
    tones: ['motivational', 'casual', 'reflective'],
    triggers: ['permission_slip', 'specificity_shock', 'stakes_escalation'],
    formats: ['micro-lesson', 'question', 'list'],
  },
  evening: {
    count: 2,
    pillars: ['sacrifice', 'pain', 'dreams'],
    tones: ['reflective', 'empathetic'],
    triggers: ['pattern_interrupt', 'social_proof_inverse'],
    formats: ['micro-story', 'progress-log'],
  },
};

export function getSystemPrompt() {
  return systemPrompt;
}

export function buildBatchPrompt(batchName, agentState) {
  const batch = BATCH_CONFIG[batchName];
  if (!batch) throw new Error(`Unknown batch: ${batchName}. Use: morning, afternoon, evening`);

  const recentPostTexts = (agentState.content.recent_posts || [])
    .slice(-10)
    .map((p) => p.text)
    .join('\n- ');

  const recentHooks = (agentState.content.recent_hooks || []).slice(-5).join(', ');
  const recentTriggers = (agentState.content.recent_triggers_used || []).slice(-5).join(', ');
  const storylines = (agentState.operational.open_storylines || []).join('\n- ');

  const topPatterns = (agentState.performance?.top_performing_patterns || []).slice(0, 4);
  const perfContext =
    topPatterns.length > 0
      ? '\nPerformance insights (real engagement data — favor these patterns):\n' +
        topPatterns
          .map((p) => `- ${p.dimension} "${p.value}": avg ${p.avg_engagement} engagements (n=${p.sample_size})`)
          .join('\n')
      : '';

  return `Generate ${batch.count} posts for the ${batchName} batch.

Current state:
- Week: ${agentState.operational.week}
- Arc phase: ${agentState.operational.arc_phase}
- Audience stage: ${agentState.operational.audience_stage}
- Goal: follower_growth

Requirements:
- Pillars: ${batch.pillars.join(', ')}
- Tones (one per post): ${batch.tones.join(', ')}
- Psychological triggers (one per post, no repeats): ${batch.triggers.join(', ')}
- Formats (one per post): ${batch.formats.join(', ')}
- Platform: X (Twitter) — max 280 characters per post
- Quality threshold: 7.0 minimum
- At most 1 post may open with a question
- One post should reference an open storyline if possible

Open storylines:
- ${storylines || '(none yet)'}

Recent posts (avoid similarity > 0.70):
- ${recentPostTexts || '(none yet)'}

Recent hooks used (do not reuse within 7 days): ${recentHooks || '(none)'}
Recent triggers used (do not use same trigger consecutively): ${recentTriggers || '(none)'}

Retired phrases (never use): ${agentState.content_library.retired_phrases.join(', ')}
${perfContext}
Output ONLY a JSON array of post objects. Each object must follow this exact schema:
{
  "text": "the tweet text (max 280 chars)",
  "tone": "one of: motivational | tough-love | empathetic | casual | reflective",
  "format": "one of: micro-lesson | micro-story | question | thread | progress-log | quote-style | list | image-caption",
  "pillar": ["pillar1", "pillar2"],
  "psychological_trigger": "trigger_name",
  "hook_template_id": null,
  "audience_fit": {
    "pain_point": "named pain point or null",
    "desire": "named desire or null"
  },
  "goal_alignment": {
    "stage": "${agentState.operational.audience_stage}",
    "objective": "follower_growth"
  },
  "arc_phase": "${agentState.operational.arc_phase}",
  "hashtags": [],
  "quality_score": 0.0,
  "quality_breakdown": {
    "clarity": 0.0,
    "originality": 0.0,
    "emotional_impact": 0.0,
    "virality_potential": 0.0,
    "audience_fit": 0.0
  },
  "decision_reason": "brief explanation"
}

Return ONLY the JSON array. No markdown fences. No explanation.`;
}
