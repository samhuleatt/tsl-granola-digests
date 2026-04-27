import { getStartOfToday, isDigestMonday } from './time.js';

const BASE_URL = 'https://public-api.granola.ai/v1';

async function granolaGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${process.env.GRANOLA_API_KEY}` }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Granola API error (${res.status}) ${path}: ${body}`);
  }
  return res.json();
}

async function fetchNotes(createdAfter) {
  const notes = [];
  let cursor = null;

  do {
    const params = new URLSearchParams({ created_after: createdAfter.toISOString() });
    if (cursor) params.set('cursor', cursor);
    const data = await granolaGet(`/notes?${params}`);
    notes.push(...data.notes);
    cursor = data.hasMore ? data.cursor : null;
  } while (cursor);

  return notes;
}

export async function fetchTodaysMeetings() {
  const now = new Date();
  const isMonday = isDigestMonday(now);
  const hoursBack = isMonday ? 72 : 24;
  const since = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  return fetchNotes(since);
}

export async function fetchTodaysNotes() {
  return fetchNotes(getStartOfToday());
}

export async function fetchWeeksMeetings() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return fetchNotes(since);
}

export function filterTSLMeetings(notes) {
  return notes.filter(note => {
    if (!note.title) return false;
    const title = note.title.toLowerCase();
    const relevant =
      title.includes('david') ||
      title.includes('dz') ||
      title.includes('charlotte') ||
      title.includes('tsl') ||
      title.includes('#tslinternal') ||
      title.includes('allocator');
    return relevant;
  });
}

export async function fetchNoteDetail(id) {
  return granolaGet(`/notes/${id}`);
}

function noteText(note) {
  return [
    note.summary,
    note.summary_markdown,
    note.body,
    note.body_markdown,
    note.content,
    note.notes,
    note.markdown,
    note.text,
    note.transcript
  ]
    .filter(Boolean)
    .map(value => typeof value === 'string' ? value : JSON.stringify(value))
    .join('\n')
    .toLowerCase();
}

function noteTimestamp(note) {
  const value =
    note.meeting_start_at ||
    note.started_at ||
    note.start_time ||
    note.created_at ||
    note.createdAt ||
    note.date;
  const timestamp = value ? new Date(value).getTime() : 0;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export async function fetchLatestSamUpdate() {
  const notes = await fetchTodaysNotes();
  const details = await Promise.all(
    notes.map(async note => {
      try {
        return await fetchNoteDetail(note.id);
      } catch {
        return note;
      }
    })
  );

  return details
    .filter(note => noteText(note).includes('#samsupdate'))
    .sort((a, b) => noteTimestamp(b) - noteTimestamp(a))[0] || null;
}
