import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildMeetingSourceLine } from './time.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = new Anthropic();
const DAILY_GENERATION_ATTEMPTS = 3;

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
  if (!samUpdate) return 'No optional Sam update is available. Use last known state and other context without mentioning this absence.';

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

export function sanitizeDigestSourceText(value) {
  return asText(value)
    .split('\n')
    .map(line => line
      .replace(/\b[A-Z][A-Za-z]+-[A-Za-z]+-\d+(?:\.\d+)?\b/g, 'implementation note')
      .replace(/\bPR\s*#?\d+\b/gi, 'implementation note')
      .replace(/\bpull request\s*#?\d+\b/gi, 'implementation note')
      .replace(/\b(?:src|app|components|routes|pages|supabase|api)\/[A-Za-z0-9_.\/-]+/gi, 'the codebase')
      .replace(/\/dashboard\/[A-Za-z0-9_/-]+/gi, 'the app')
      .replace(/\b[A-Za-z0-9_.-]+\.(?:js|jsx|ts|tsx|sql|md|json|yml|yaml)\b/g, 'implementation file'))
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      const engineeringOnly =
        /\b(commit|merged|branch|diff|migration|refactor|lint|test suite|typescript|eslint)\b/i.test(trimmed) &&
        !/\b(LP|fund|funds|allocator|David|Sam|Charlotte|Rajesh|services|GTM|diligence|package|buyer|launch|sale|TSL20)\b/i.test(trimmed);
      return !engineeringOnly;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

async function generateValidatedDailyDigest(system, user, priorDigests) {
  const validationNotes = [];

  for (let attempt = 1; attempt <= DAILY_GENERATION_ATTEMPTS; attempt++) {
    const retryInstruction = validationNotes.length
      ? [
          '',
          '# Previous draft failed validation',
          ...validationNotes.map(note => `- ${note}`),
          'Regenerate from the same source material. Remove the violation while preserving the Product / Services operating memo shape.'
        ].join('\n')
      : '';

    const digest = normalizeDailyDigest(
      extractJson(await generate(system, `${user}${retryInstruction}`)),
      priorDigests
    );
    const body = renderDailyDigestBody(digest);

    try {
      validateDailyDigestBody(body);
      return body;
    } catch (err) {
      validationNotes.push(err.message);
      console.warn(`Daily digest draft ${attempt}/${DAILY_GENERATION_ATTEMPTS} failed validation: ${err.message}`);
    }
  }

  throw new Error(`Daily digest failed validation after ${DAILY_GENERATION_ATTEMPTS} attempts: ${validationNotes.at(-1)}`);
}

function textOnly(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSectionText(text, startPattern, endPattern) {
  const start = text.search(startPattern);
  if (start === -1) return '';
  const rest = text.slice(start);
  const end = rest.slice(1).search(endPattern);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

function compactLine(value, maxLength = 900) {
  const text = asText(value).replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

export function buildPriorDigestContext(priorDigests = []) {
  const values = asArray(priorDigests);
  if (!values.length) {
    return 'No prior daily digest history available.';
  }

  return values.map(digest => {
    const text = textOnly(asText(digest.html));
    const services = extractSectionText(
      text,
      /\bSERVICES\s*\/\s*GTM\s*\(David\)/i,
      /\bPRODUCT\s*\(Sam\)/i
    );

    return [
      `## ${digest.digest_date || digest.subject || 'Prior digest'}`,
      services
        ? compactLine(services, 1400)
        : 'No Services / GTM section captured in this prior digest.'
    ].join('\n');
  }).join('\n\n');
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
    .slice(0, 3)
    .map(workflow => {
      const name = escapeHtml(asText(workflow.name, 'Unnamed workflow'));
      const percent = percentText(workflow.percent);
      const summary = escapeHtml(asText(workflow.summary || workflow.done, 'User outcome needs definition.'));
      const inFlight = escapeHtml(asText(workflow.inFlight, 'No active work called out today.'));
      return `<li style="margin: 0 0 10px 0;"><strong>${name} (${percent} complete)</strong> — ${summary}<br>In flight: ${inFlight}</li>`;
    })
    .join('')}</ul>`;
}

function servicesHasContent(services) {
  return asArray(services.activeEngagements).length ||
    asArray(services.diligencePackages).length ||
    asArray(services.needsDiscussion).length;
}

function latestPriorServicesDigest(priorDigests = []) {
  const [latest] = asArray(priorDigests);
  if (!latest) return '';
  const text = textOnly(asText(latest.html));
  return extractSectionText(
    text,
    /\bSERVICES\s*\/\s*GTM\s*\(David\)/i,
    /\bPRODUCT\s*\(Sam\)/i
  );
}

function normalizeDailyDigest(digest, priorDigests = []) {
  const normalized = {
    product: digest.product || {},
    services: digest.services || {}
  };

  normalized.product.workflows = asArray(normalized.product.workflows).slice(0, 3);

  if (!servicesHasContent(normalized.services)) {
    const priorServices = latestPriorServicesDigest(priorDigests);
    normalized.services = {
      activeEngagements: priorServices
        ? [`Carry forward from prior Services / GTM state — ${compactLine(priorServices, 500)}`]
        : [],
      diligencePackages: [],
      needsDiscussion: []
    };
  }

  return normalized;
}

function renderDailyDigestBody(digest) {
  const product = digest.product || {};
  const services = digest.services || {};
  const biggestUnblock = asText(product.biggestUnblock);
  const servicesBody = renderServicesBody(services);

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
  ${servicesBody}
</div>`;
}

function renderServicesBody(services) {
  if (!servicesHasContent(services)) {
    return '<p style="margin: 0 0 14px 0;">No current Services / GTM update.</p>';
  }

  return `
  ${asArray(services.activeEngagements).length ? `
  <h3 style="font-size: 15px; font-weight: bold; margin: 0 0 8px 0;">Active Engagements</h3>
  ${renderBullets(services.activeEngagements, '')}` : ''}

  ${asArray(services.diligencePackages).length ? `
  <h3 style="font-size: 15px; font-weight: bold; margin: 20px 0 8px 0;">Diligence Packages</h3>
  ${renderBullets(services.diligencePackages, '')}` : ''}

  ${asArray(services.needsDiscussion).length ? `
  <h3 style="font-size: 15px; font-weight: bold; margin: 20px 0 8px 0;">Needs Discussion</h3>
  ${renderBullets(services.needsDiscussion, '')}` : ''}`;
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

  const bannedPhrases = [
    /\bSupply Loop\b/i,
    /\bDemand Loop\b/i,
    /\bT-[A-Za-z0-9-]+(?:\.\d+)?\b/i,
    /\boracle\b/i,
    /\bcanonical fields?\b/i,
    /\bmanual locks?\b/i,
    /\badmin review queue\b/i,
    /\bstub routes?\b/i,
    /\bproxy query\b/i,
    /\bcold-start\b/i,
    /\bGemini enrichment\b/i,
    /\blong_description\b/i,
    /\bimplementation note\b/i,
    /\bimplementation file\b/i,
    /\bPR\s*#?\d+\b/i,
    /\bpull request\s*#?\d+\b/i,
    /\b(?:src|app|components|routes|pages|supabase|api)\/[A-Za-z0-9_.\/-]+/i,
    /\/dashboard\/[A-Za-z0-9_/-]+/i,
    /\bNo active external engagement moved today\b/i,
    /\bNo diligence package movement today\b/i,
    /\bNo prior services state available\b/i,
    /\bNo prior Services\s*\/\s*GTM state available\b/i,
    /\bDavid to provide current\b/i,
    /\bNo #samsupdate note found\b/i
  ];

  const leakedPhrase = bannedPhrases.find(pattern => pattern.test(text));
  if (leakedPhrase) {
    throw new Error(`Daily digest leaked a banned implementation or fallback phrase: ${leakedPhrase}`);
  }

  const workflowCount = (text.match(/\(\d+%\s+complete\)/gi) || []).length;
  if (workflowCount > 3) {
    throw new Error(`Daily digest included ${workflowCount} product workflows; max is 3.`);
  }

  const longWorkflowLine = text
    .split(/In flight:/i)
    .map(line => line.trim())
    .find(line => {
      const match = line.match(/\(\d+%\s+complete\)\s+—\s+(.+)/i);
      if (!match) return false;
      return wordCount(match[1]) > 22;
    });

  if (longWorkflowLine) {
    throw new Error('Daily digest included an overlong workflow summary.');
  }
}

function wordCount(value) {
  return asText(value).split(/\s+/).filter(Boolean).length;
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

export async function generateDailyDigest({ meetings, tasks, samUpdate, priorDigests = [], heading }) {
  const system = loadPrompt('daily');
  const meetingsText = buildMeetingsText(meetings);
  const samUpdateText = buildSamUpdateText(samUpdate);
  const sanitizedTasks = sanitizeDigestSourceText(tasks);
  const tasksText = sanitizedTasks ? `## TASKS.md\n${sanitizedTasks}` : '(No product-level TASKS.md context available)';
  const priorDigestText = buildPriorDigestContext(priorDigests);
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
    tasksText,
    '',
    '# Recent prior daily digest history',
    priorDigestText
  ].join('\n');
  const body = await generateValidatedDailyDigest(system, user, priorDigests);
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
