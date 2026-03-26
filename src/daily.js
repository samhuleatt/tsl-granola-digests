import { fetchTodaysMeetings, filterTSLMeetings, fetchNoteDetail } from './granola.js';
import { generateDailyDigest } from './claude.js';
import { sendEmail } from './resend.js';

async function fetchTasks() {
  const pat = process.env.GH_PAT;
  console.log(`[debug] GH_PAT present: ${!!pat}`);
  const url = 'https://api.github.com/repos/samhuleatt/the-side-letter/contents/TASKS.md';
  console.log(`[debug] Fetching TASKS.md: ${url}`);
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${pat}` } });
    console.log(`[debug] GitHub API status: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const body = await res.text();
      console.log(`[debug] GitHub API error body: ${body}`);
      return null;
    }
    const { content } = await res.json();
    return Buffer.from(content, 'base64').toString('utf8');
  } catch (err) {
    console.log(`[debug] fetchTasks threw: ${err.message}`);
    return null;
  }
}

async function main() {
  // 1. Fetch today's notes from Granola
  console.log('Fetching today\'s meetings from Granola...');
  const allNotes = await fetchTodaysMeetings();
  console.log(`Fetched ${allNotes.length} notes total`);

  // 2. Filter to TSL-relevant
  const tslNotes = filterTSLMeetings(allNotes);
  console.log(`${tslNotes.length} TSL-relevant meetings`);

  // 3. Fetch TASKS.md (skip silently on failure)
  console.log('Fetching TASKS.md...');
  const tasks = await fetchTasks();
  if (!tasks) console.log('TASKS.md unavailable — continuing without it');

  // 4. Fetch full note detail for each TSL meeting
  const meetings = await Promise.all(
    tslNotes.map(async note => {
      try {
        const detail = await fetchNoteDetail(note.id);
        console.log(`[debug] Note ${note.id} top-level fields: ${Object.keys(detail).join(', ')}`);
        console.log(`[debug] Note ${note.id} summary: ${JSON.stringify(detail.summary)?.slice(0, 200) ?? 'MISSING'}`);
        return detail;
      } catch (err) {
        console.warn(`Failed to fetch detail for note ${note.id}: ${err.message}`);
        return note;
      }
    })
  );

  // 5. Generate digest HTML via Claude
  console.log('Generating digest with Claude...');
  const html = await generateDailyDigest({ meetings, tasks });

  // 6. Build subject and send
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const subject = `TSL Daily — ${dateStr}`;
  console.log(`Subject: ${subject}`);

  await sendEmail({ subject, html });
  console.log('Daily digest sent successfully');
}

main().catch(err => {
  console.error('Daily digest failed:', err);
  process.exit(1);
});
