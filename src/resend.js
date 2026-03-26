export async function sendEmail({ subject, html }) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Sending email attempt ${attempt}/${maxAttempts}...`);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'TSL Digest <digest@mail.thesideletter.co>',
          to: ['sam.huleatt@gmail.com', 'dav.j.zhou@gmail.com'],
          subject,
          html
        })
      });
      const body = await res.text();
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
