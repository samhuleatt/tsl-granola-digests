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

function textOnly(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJson(text) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error('Daily digest response did not contain JSON.');
  }

  return JSON.parse(withoutFence.slice(start, end + 1));
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function asText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function percentText(value) {
  const number = Number(String(value).replace('%', ''));
  if (!Number.isFinite(number)) return '0%';
  return `${Math.max(0, Math.min(100, Math.round(number)))}%`;
}

function renderBullets(items, fallback) {
  const values = asArray(items);
  if (!values.length) {
    return `<ul style="margin: 0 0 14px 20px; padding: 0;"><li style="margin: 0 0 10px 0;">${escapeHtml(fallback)}</li></ul>`;
  }

  return `<ul style="margin: 0 0 14px 20px; padding: 0;">${values
    .map(item => `<li style="margin: 0 0 10px 0;">${escapeHtml(asText(item))}</li>`)
    .join('')}</ul>`;
}

function renderWorkflows(workflows) {
  const values = asArray(workflows);
  if (!values.length) {
    return renderBullets(['No active product workflow moved today.'], 'No active product workflow moved today.');
  }

  return `<ul style="margin: 0 0 14px 20px; padding: 0;">${values
    .map(workflow => {
      const name = escapeHtml(asText(workflow.name, 'Unnamed workflow'));
      const percent = percentText(workflow.percent);
      const done = escapeHtml(asText(workflow.done, 'Done state needs definition.'));
      const inFlight = escapeHtml(asText(workflow.inFlight, 'No active work called out today.'));
      const gap = escapeHtml(asText(workflow.gap, 'No explicit gap.'));
      return `<li style="margin: 0 0 10px 0;"><strong>${name} (${percent} complete)</strong> — ${done}<br>In flight: ${inFlight}<br>Gap: ${gap}</li>`;
    })
    .join('')}</ul>`;
}

function renderDailyDigestBody(digest) {
  const product = digest.product || {};
  const services = digest.services || {};
  const biggestUnblock = asText(product.biggestUnblock);

  return `<div style="font-family: Georgia, serif; font-size: 15px; line-height: 1.6;">
  <p style="font-size: 13px; letter-spacing: 0.08em; color: #777; margin: 24px 0 10px 0;">═══════════════════════════════════════════</p>
  <h2 style="font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #333; margin: 0 0 12px 0;">PRODUCT (Sam)</h2>
  <p style="font-size: 13px; letter-spacing: 0.08em; color: #777; margin: 0 0 18px 0;">═══════════════════════════════════════════</p>

  <h3 style="font-size: 15px; font-weight: bold; margin: 0 0 8px 0;">Key Workflows</h3>
  ${renderWorkflows(product.workflows)}

  <h3 style="font-size: 15px; font-weight: bold; margin: 20px 0 8px 0;">Needs Discussion</h3>
  ${renderBullets(product.needsDiscussion, 'None urgent today.')}

  ${biggestUnblock ? `<p style="margin: 16px 0 0 0;"><strong>Biggest unblock:</strong> ${escapeHtml(biggestUnblock)}</p>` : ''}

  <p style="font-size: 13px; letter-spacing: 0.08em; color: #777; margin: 28px 0 10px 0;">═══════════════════════════════════════════</p>
  <h2 style="font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #333; margin: 0 0 12px 0;">SERVICES / GTM (David)</h2>
  <p style="font-size: 13px; letter-spacing: 0.08em; color: #777; margin: 0 0 18px 0;">═══════════════════════════════════════════</p>

  <p style="margin: 0 0 16px 0;"><strong>Goal:</strong> $10K in services revenue by end of May.</p>

  <h3 style="font-size: 15px; font-weight: bold; margin: 0 0 8px 0;">Active Engagements</h3>
  ${renderBullets(services.activeEngagements, 'No active external engagement moved today.')}

  <h3 style="font-size: 15px; font-weight: bold; margin: 20px 0 8px 0;">Diligence Packages</h3>
  ${renderBullets(services.diligencePackages, 'No diligence package movement today.')}

  <h3 style="font-size: 15px; font-weight: bold; margin: 20px 0 8px 0;">Needs Discussion</h3>
  ${renderBullets(services.needsDiscussion, 'None urgent today.')}
</div>`;
}

export function validateDailyDigestBody(body) {
  const text = textOnly(body);
  const oldSections = [
    'Meetings',
    'Open Tasks',
    'Suggested Priorities for Tomorrow'
  ];
  const leakedOldSection = oldSections.find(section => new RegExp(`\\b${section}\\b`, 'i').test(text));

  if (leakedOldSection) {
    throw new Error(`Daily digest used old section "${leakedOldSection}" instead of the Product / Services operating memo.`);
  }

  if (!/\bPRODUCT\s*\(Sam\)/i.test(text)) {
    throw new Error('Daily digest is missing PRODUCT (Sam).');
  }

  if (!/\bSERVICES\s*\/\s*GTM\s*\(David\)/i.test(text)) {
    throw new Error('Daily digest is missing SERVICES / GTM (David).');
  }
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
  const digest = extractJson(await generate(system, user));
  const body = renderDailyDigestBody(digest);
  validateDailyDigestBody(body);
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
