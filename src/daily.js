import { fetchLatestSamUpdate, fetchTodaysMeetings, filterTSLMeetings, fetchNoteDetail } from './granola.js';
import { generateDailyDigest } from './claude.js';
import { sendEmail } from './resend.js';
import { saveDailyDigest } from './supabase.js';
import { formatDailyHeadingDate, formatDailyStorageDate, formatDailySubjectDate, getDigestHour, isDigestSendHour } from './time.js';

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
  if (process.env.REQUIRE_DIGEST_HOUR === 'true' && !isDigestSendHour()) {
    console.log(`Skipping daily digest because it is ${getDigestHour()}:00 ET, not 21:00 ET.`);
    return;
  }

  // 1. Fetch today's notes from Granola
  console.log('Fetching today\'s meetings from Granola...');
  const allNotes = await fetchTodaysMeetings();
  console.log(`Fetched ${allNotes.length} notes total`);

  // 2. Filter to TSL-relevant meeting context
  const tslNotes = filterTSLMeetings(allNotes);
  console.log(`${tslNotes.length} TSL-relevant meetings`);

  // 3. Fetch Sam's optional daily status update
  console.log('Fetching latest #samsupdate note...');
  const samUpdate = await fetchLatestSamUpdate();
  console.log(samUpdate ? `Found #samsupdate: ${samUpdate.title || samUpdate.id}` : 'No #samsupdate note found today');

  // 4. Fetch TASKS.md (skip silently on failure)
  console.log('Fetching TASKS.md...');
  const tasks = await fetchTasks();
  if (!tasks) console.log('TASKS.md unavailable — continuing without it');

  // 5. Fetch full note detail for each TSL meeting
  const meetings = await Promise.all(
    tslNotes.map(async note => {
      try {
        const detail = await fetchNoteDetail(note.id);
        console.log(`[debug] Note ${note.id} top-level fields: ${Object.keys(detail).join(', ')}`);
        console.log(`[debug] Note ${note.id} summary_markdown: ${JSON.stringify(detail.summary_markdown)?.slice(0, 200) ?? 'MISSING'}`);
        return detail;
      } catch (err) {
        console.warn(`Failed to fetch detail for note ${note.id}: ${err.message}`);
        return note;
      }
    })
  );

  // 6. Generate digest HTML via Claude
  console.log('Generating digest with Claude...');
  const today = new Date();
  const heading = `TSL Daily — ${formatDailyHeadingDate(today)}`;
  const html = await generateDailyDigest({ meetings, tasks, samUpdate, heading });

  // 7. Build subject and send
  const dateStr = formatDailySubjectDate(today);
  const subject = `TSL Daily — ${dateStr}`;
  console.log(`Subject: ${subject}`);

  await saveDailyDigest({
    digestDate: formatDailyStorageDate(today),
    subject,
    html
  });

  await sendEmail({ subject, html });
  console.log('Daily digest sent successfully');
}

main().catch(err => {
  console.error('Daily digest failed:', err);
  process.exit(1);
});
