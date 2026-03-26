import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = new Anthropic();

function loadPrompt(name) {
  return readFileSync(join(__dirname, '..', 'prompts', `${name}.md`), 'utf8');
}

function buildMeetingsText(meetings) {
  if (!meetings.length) return 'No TSL meetings today.';
  return meetings.map(m => {
    const summary = m.summary_markdown || '(no summary available)';
    return `## ${m.title}\n${summary}`;
  }).join('\n\n');
}

async function generate(systemPrompt, userMessage) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });
  return msg.content[0].text;
}

export async function generateDailyDigest({ meetings, tasks }) {
  const system = loadPrompt('daily');
  const meetingsText = buildMeetingsText(meetings);
  const tasksText = tasks ? `## TASKS.md\n${tasks}` : '(TASKS.md unavailable)';
  const user = `${meetingsText}\n\n${tasksText}`;
  return generate(system, user);
}

export async function generateWeeklyDigest({ meetings, tasks }) {
  const system = loadPrompt('weekly');
  const meetingsText = buildMeetingsText(meetings);
  const tasksText = tasks ? `## TASKS.md\n${tasks}` : '(TASKS.md unavailable)';
  const user = `${meetingsText}\n\n${tasksText}`;
  return generate(system, user);
}
