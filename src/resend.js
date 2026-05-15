export async function sendEmail({ subject, html, idempotencyKey }) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Sending email attempt ${attempt}/${maxAttempts}...`);
      const headers = {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: 'TSL Digest <digest@mail.thesideletter.co>',
          to: ['sam.huleatt@gmail.com', 'dav.j.zhou@gmail.com'],
          subject,
          html
        })
      });
      const body = await res.text();
      if (res.status === 409 && /idempotent|idempotency/i.test(body)) {
        console.warn(`Email send suppressed by Resend idempotency key "${idempotencyKey}" — ${body}`);
        return;
      }
      if (!res.ok) throw new Error(`Resend API error (${res.status}): ${body}`);
      console.log(`Email sent successfully — ${body}`);
      return;
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err.message);
      if (attempt < maxAttempts) {
        console.log('Retrying in 5s...');
        await new Promise(r => setTimeout(r, 5000));
      } else {
        throw new Error(`All ${maxAttempts} Resend attempts failed: ${err.message}`);
      }
    }
  }
}
