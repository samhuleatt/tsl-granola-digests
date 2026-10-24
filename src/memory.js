import { readFileSync } from 'fs';
import { buildMeetingSourceLine } from './time.js';

export function loadOperatingMemory() {
  return JSON.parse(readFileSync(new URL('../memory/operating-context.json', import.meta.url), 'utf8'));
}

export function buildMemoryContext(historicalMeetings = [], { includeHistory = true } = {}) {
  const memory = loadOperatingMemory();
  const confirmed = memory.entries.map(entry =>
    `- [${entry.kind}; as of ${entry.asOf}; ${entry.source}] ${entry.statement}`
  ).join('\n');
  const history = historicalMeetings.map(meeting =>
    `## ${buildMeetingSourceLine([meeting]).replace('Sources: ', '')}\n${meeting.summary_markdown}`
  ).join('\n\n');
  if (!includeHistory) return `# Durable owner-confirmed memory\n${confirmed}`;
  return `# Durable owner-confirmed memory\n${confirmed}\n\n# Historical meeting evidence\n${history || 'No historical meeting evidence available. Do not claim a development is new or unchanged without a baseline.'}`;
}

function timestamp(note) {
  const value = note.meeting_start_at || note.started_at || note.created_at || note.createdAt || note.date;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Keep recent continuity and older context across months. Source notes remain
// durably stored in Granola; this is a bounded retrieval window, not a deletion
// or rolling overwrite of that archive. Never recycle generated prose as truth.
export function selectHistoricalNotes(notes, { before, currentIds = [], limit = 24 }) {
  const excluded = new Set(currentIds);
  const candidates = notes.filter(note => note.id && !excluded.has(note.id) && timestamp(note) > 0 && timestamp(note) < before.getTime())
    .sort((a, b) => timestamp(b) - timestamp(a));
  const selected = candidates.slice(0, Math.min(12, limit));
  const selectedIds = new Set(selected.map(note => note.id));
  const months = new Set();
  for (const note of candidates) {
    if (selected.length >= limit) break;
    if (selectedIds.has(note.id)) continue;
    const month = new Date(timestamp(note)).toISOString().slice(0, 7);
    if (months.has(month)) continue;
    months.add(month);
    selected.push(note);
    selectedIds.add(note.id);
  }
  for (const note of candidates) {
    if (selected.length >= limit) break;
    if (!selectedIds.has(note.id)) { selected.push(note); selectedIds.add(note.id); }
  }
  return selected.sort((a, b) => timestamp(a) - timestamp(b));
}
