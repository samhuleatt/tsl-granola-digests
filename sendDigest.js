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

console.log(`Sending ${type} digest email...`);

fetch('https://api.resend.com/emails', {
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
}).then(async res => {
  const body = await res.text();
  if (!res.ok) {
    console.error('Resend API error:', body);
    process.exit(1);
  }
  console.log('Digest sent successfully');
}).catch(err => {
  console.error('Fetch error:', err);
  process.exit(1);
});
