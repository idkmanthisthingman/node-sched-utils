import Groq from 'groq-sdk';
import { getSystemPrompt, buildBatchPrompt } from './prompts.js';
import { loadState, saveState, recordPosts } from './state.js';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function generate(batchName) {
  console.log(`Generating ${batchName} batch...`);

  const state = loadState();
  const systemPrompt = getSystemPrompt();
  const userPrompt = buildBatchPrompt(batchName, state);

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
    max_tokens: 4096,
  });

  const raw = response.choices[0]?.message?.content || '';

  // Extract JSON array from response (handle markdown fences if present)
  let jsonStr = raw.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  let posts;
  try {
    posts = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse LLM response as JSON:');
    console.error(raw);
    process.exit(1);
  }

  if (!Array.isArray(posts)) {
    console.error('LLM response is not an array:', posts);
    process.exit(1);
  }

  // Filter by quality score
  const quality = posts.filter((p) => (p.quality_score || 0) >= 7.0);
  if (quality.length < posts.length) {
    console.log(`Filtered ${posts.length - quality.length} posts below quality threshold 7.0`);
  }

  // Validate tweet length
  const valid = quality.filter((p) => {
    if (p.text.length > 280) {
      console.log(`Skipping post (${p.text.length} chars > 280): "${p.text.slice(0, 60)}..."`);
      return false;
    }
    return true;
  });

  console.log(`Generated ${valid.length} valid posts:`);
  for (const post of valid) {
    console.log(`  [${post.tone}] [${post.format}] ${post.text.slice(0, 80)}...`);
  }

  // Save generated posts to a temp file for post.js to read
  const outPath = join(__dirname, '..', 'state', `batch-${batchName}.json`);
  writeFileSync(outPath, JSON.stringify(valid, null, 2));
  console.log(`Saved to ${outPath}`);

  // Update state
  const updated = recordPosts(state, valid);
  saveState(updated);
  console.log('Agent state updated.');
}

// CLI entry point
const batchName = process.argv.find((a) => a.startsWith('--batch'))
  ? process.argv[process.argv.indexOf('--batch') + 1]
  : process.argv[2] || 'morning';

generate(batchName).catch((err) => {
  console.error('Generation failed:', err.message);
  process.exit(1);
});
