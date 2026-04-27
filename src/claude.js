import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildMeetingSourceLine } from './time.js';

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

function buildSamUpdateText(samUpdate) {
  if (!samUpdate) return 'No #samsupdate note found today. Use last known state and other context without making the absence dramatic.';

  const summary =
    samUpdate.summary_markdown ||
    samUpdate.summary ||
    samUpdate.body_markdown ||
    samUpdate.body ||
    samUpdate.content ||
    samUpdate.notes ||
    samUpdate.markdown ||
    samUpdate.text ||
    '(no body available)';

  return `## ${samUpdate.title || 'Sam daily status update'}\n${summary}`;
}

function buildDailySourceLine(meetings, samUpdate) {
  const meetingSourceLine = buildMeetingSourceLine(meetings);
  if (!samUpdate) return meetingSourceLine;

  const samSource = `Sam update: ${samUpdate.title || 'Untitled #samsupdate note'}`;
  if (!meetings.length) return `Sources: ${samSource}`;

  return meetingSourceLine.replace('Sources: ', `Sources: ${samSource} | `);
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

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function wrapDailyHtml(body, heading, sourceLine) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Georgia, serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1a1a1a; font-size: 15px; line-height: 1.6;">
<h1 style="font-size: 20px; font-weight: bold; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 20px;">${escapeHtml(heading)}</h1>
${body}
<hr style="border: none; border-top: 1px solid #ddd; margin: 28px 0 16px 0;">
<p style="color: #aaa; font-size: 12px; margin: 0;">${escapeHtml(sourceLine)}</p>
</body>
</html>`;
}

function wrapWeeklyHtml(body, rangeLabel, sourceLine) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Georgia,serif;max-width:620px;margin:0 auto;padding:24px;color:#1a1a1a;">
<p style="font-size:13px;color:#888;margin:0 0 4px 0;">TSL Internal</p>
<h1 style="font-size:22px;font-weight:bold;margin:0 0 4px 0;">TSL Weekend Roundup</h1>
<p style="font-size:14px;color:#555;margin:0 0 24px 0;">${escapeHtml(rangeLabel)} &nbsp;·&nbsp; For Sam & David</p>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:0 0 24px 0;">
${body}
<hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0 16px 0;">
<p style="font-size:12px;color:#999;margin:0;">${escapeHtml(sourceLine)}</p>
</body></html>`;
}

export async function generateDailyDigest({ meetings, tasks, samUpdate, heading }) {
  const system = loadPrompt('daily');
  const meetingsText = buildMeetingsText(meetings);
  const samUpdateText = buildSamUpdateText(samUpdate);
  const tasksText = tasks ? `## TASKS.md\n${tasks}` : '(TASKS.md unavailable)';
  const sourceLine = buildDailySourceLine(meetings, samUpdate);
  const user = [
    `Digest heading: ${heading}`,
    `Source line: ${sourceLine}`,
    '',
    '# Sam optional daily Granola status note',
    samUpdateText,
    '',
    '# TSL meetings from the current window',
    meetingsText,
    '',
    '# Product/task context',
    tasksText
  ].join('\n');
  const body = await generate(system, user);
  return wrapDailyHtml(body, heading, sourceLine);
}

export async function generateWeeklyDigest({ meetings, tasks, rangeLabel }) {
  const system = loadPrompt('weekly');
  const meetingsText = buildMeetingsText(meetings);
  const tasksText = tasks ? `## TASKS.md\n${tasks}` : '(TASKS.md unavailable)';
  const user = [
    `Week label: ${rangeLabel}`,
    `Source line: ${buildMeetingSourceLine(meetings)}`,
    '',
    meetingsText,
    '',
    tasksText
  ].join('\n');
  const body = await generate(system, user);
  return wrapWeeklyHtml(body, rangeLabel, buildMeetingSourceLine(meetings));
}
