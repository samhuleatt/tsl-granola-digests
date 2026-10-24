import { buildMeetingSourceLine } from './time.js';

const retiredGoal = /(?:\bfirst\s+(?:paid\s+customer|paying\s+customer)\b|\$10[,.]?000\b[^.!?]{0,65}\bMay\b|\$10k\b[^.!?]{0,65}\bMay\b)/i;

export function validateEditorialText(text) {
  if (retiredGoal.test(text)) throw new Error('Digest revived the retired customer/revenue milestone.');
  if (/\b(?:weeks are being lost|vagueness will kill|needs a calendar invite, not an intention)\b/i.test(text)) {
    throw new Error('Digest used scolding language.');
  }
}

// Historical generated emails included this literal goal paragraph. Remove it
// before both prompting and deterministic carry-forward; retain other context.
export function stripRetiredGoal(html) {
  return html.replace(/<(p|li|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi,
    block => retiredGoal.test(block.replace(/<[^>]+>/g, ' ')) ? '' : block);
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderWeeklyBrief(digest, meetings, currentCount = meetings.length) {
  if (!Array.isArray(digest?.points) || digest.points.length > 3) {
    throw new Error('Weekly brief must contain zero to three points.');
  }
  const fields = ['title', 'evidence', 'inference', 'nextStep'];
  let words = 0;
  for (const point of digest.points) {
    for (const field of fields) {
      if (typeof point?.[field] !== 'string' || !point[field].trim()) {
        throw new Error(`Weekly point requires ${field}.`);
      }
      validateEditorialText(point[field]);
      words += point[field].trim().split(/\s+/).length;
    }
    if (!Array.isArray(point.sources) || !point.sources.length || point.sources.some(
      id => !Number.isInteger(id) || id < 1 || id > meetings.length
    )) throw new Error('Weekly point must cite provided source numbers.');
    if (!point.sources.some(id => id <= currentCount)) {
      throw new Error('Weekly point needs current evidence; history alone is not a new development.');
    }
  }
  if (words > 350) throw new Error(`Weekly brief has ${words} words; maximum is 350.`);
  return digest.points.map(point => {
    const sources = [...new Set(point.sources)].map(id =>
      buildMeetingSourceLine([meetings[id - 1]]).replace('Sources: ', '')
    ).join(' | ');
    return `<h2 style="font-size:17px;margin:22px 0 8px;">${escapeHtml(point.title)}</h2>
<p style="font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(point.evidence)}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 8px;"><strong>Read:</strong> ${escapeHtml(point.inference)}</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 8px;">${escapeHtml(point.nextStep)}</p>
<p style="font-size:12px;color:#777;margin:0 0 16px;">${escapeHtml(sources)}</p>`;
  }).join('\n');
}
