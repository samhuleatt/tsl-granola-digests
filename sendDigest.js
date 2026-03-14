const fs = require('fs');

// Accept explicit type argument (e.g. "node sendDigest.js weekly")
// so the workflow can specify which file to send rather than always picking daily first.
const arg = process.argv[2];
let file, type;

if (arg === 'weekly') {
  file = 'pending/weekly.json';
  type = 'weekly';
} else if (arg === 'daily') {
  file = 'pending/daily.json';
  type = 'daily';
} else if (fs.existsSync('pending/weekly.json')) {
  file = 'pending/weekly.json';
  type = 'weekly';
} else if (fs.existsSync('pending/daily.json')) {
  file = 'pending/daily.json';
  type = 'daily';
} else {
  console.error('No digest file found in pending/');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log(`Sending ${type} digest: "${payload.subject}"`);

async function sendWithRetry(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxAttempts}...`);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'TSL Digest <digest@mail.thesideletter.co>',
          to: ['sam.huleatt@gmail.com', 'dav.j.zhou@gmail.com'],
          subject: payload.subject,
          html: payload.html
        })
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`Resend API error (${res.status}): ${body}`);
      console.log(`Digest sent successfully — ${body}`);
      return;
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err.message);
      if (attempt < maxAttempts) {
        console.log(`Retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        console.error('All attempts failed.');
        process.exit(1);
      }
    }
  }
}

sendWithRetry();
