import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';

const resend = new Resend(process.env.RESEND_API_KEY);

interface DigestPayload {
  subject: string;
  html: string;
  to: string[];
  from: string;
}

async function sendWithRetry(payload: DigestPayload, maxAttempts = 2): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[Weekly Digest] Sending email — attempt ${attempt}/${maxAttempts}`);
      const { data, error } = await resend.emails.send({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });

      if (error) {
        throw new Error(`Resend error: ${JSON.stringify(error)}`);
      }

      console.log(`[Weekly Digest] ✓ Sent successfully — ID: ${data?.id}`);
      return;
    } catch (err) {
      console.error(`[Weekly Digest] ✗ Attempt ${attempt} failed:`, err);
      if (attempt < maxAttempts) {
        console.log(`[Weekly Digest] Retrying in 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        throw err;
      }
    }
  }
}

async function main() {
  console.log(`[Weekly Digest] Starting — ${new Date().toISOString()}`);

  const payloadPath = path.join(__dirname, '..', 'pending', 'weekly.json');

  if (!fs.existsSync(payloadPath)) {
    console.error(`[Weekly Digest] No pending digest found at ${payloadPath}`);
    process.exit(1);
  }

  const payload: DigestPayload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
  console.log(`[Weekly Digest] Loaded digest: "${payload.subject}"`);

  await sendWithRetry(payload);
  console.log(`[Weekly Digest] Done.`);
}

main().catch(err => {
  console.error('[Weekly Digest] Fatal error:', err);
  process.exit(1);
});
