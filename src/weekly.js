import { fetchWeeksMeetings, filterTSLMeetings, fetchNoteDetail } from './granola.js';
import { generateWeeklyDigest } from './claude.js';
import { sendEmail } from './resend.js';

async function fetchTasks() {
  try {
    const res = await fetch(
      'https://api.github.com/repos/samhuleatt/the-side-letter/contents/TASKS.md',
      { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } }
    );
    if (!res.ok) return null;
    const { content } = await res.json();
    return Buffer.from(content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

async function main() {
  // 1. Fetch last 7 days of notes from Granola
  console.log('Fetching this week\'s meetings from Granola...');
  const allNotes = await fetchWeeksMeetings();
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
        return await fetchNoteDetail(note.id);
      } catch (err) {
        console.warn(`Failed to fetch detail for note ${note.id}: ${err.message}`);
        return note;
      }
    })
  );

  // 5. Generate digest HTML via Claude
  console.log('Generating weekly digest with Claude...');
  const html = await generateWeeklyDigest({ meetings, tasks });

  // 6. Build subject and send
  const today = new Date();
  const weekEnd = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const weekStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const subject = `TSL Weekly — ${weekStart}–${weekEnd}`;
  console.log(`Subject: ${subject}`);

  await sendEmail({ subject, html });
  console.log('Weekly digest sent successfully');
}

main().catch(err => {
  console.error('Weekly digest failed:', err);
  process.exit(1);
});
