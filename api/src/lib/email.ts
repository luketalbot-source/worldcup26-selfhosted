// Mailjet transactional email helper.
//
// Used by the admin-login flow to deliver one-time codes. Could grow to
// support other transactional emails (league invites, weekly digests…)
// later.
//
// Mailjet uses HTTP basic auth with two credentials — an API key and an
// API secret. Both come from env vars MAILJET_API_KEY and
// MAILJET_API_SECRET. The from address (MAILJET_FROM) must be at a
// domain you've verified at mailjet.com — Flip's getflip.com is set up,
// so e.g. `Football 2026 <noreply@getflip.com>` works.

const MAILJET_API_URL = "https://api.mailjet.com/v3.1/send";

export interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(
  opts: SendEmailOptions,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_API_SECRET;
  if (!apiKey || !apiSecret) {
    return { ok: false, error: "MAILJET_API_KEY / MAILJET_API_SECRET not configured" };
  }

  // Default from-address — overrideable per-deploy via env var. Format
  // accepts both bare email ("foo@bar.com") and named form
  // ("Display Name <foo@bar.com>") for parity with how SMTP From: headers
  // are usually written. We parse it into Mailjet's split shape below.
  const fromRaw = process.env.MAILJET_FROM ?? "Football 2026 <noreply@getflip.com>";
  const namedMatch = fromRaw.match(/^(.+?)\s*<\s*([^>]+)\s*>\s*$/);
  const fromEmail = namedMatch ? namedMatch[2]! : fromRaw.trim();
  const fromName = namedMatch ? namedMatch[1]!.trim() : undefined;

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  try {
    const res = await fetch(MAILJET_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: fromName ? { Email: fromEmail, Name: fromName } : { Email: fromEmail },
            To: [opts.toName ? { Email: opts.to, Name: opts.toName } : { Email: opts.to }],
            Subject: opts.subject,
            HTMLPart: opts.html,
            ...(opts.text ? { TextPart: opts.text } : {}),
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] Mailjet rejected:", res.status, body);
      return { ok: false, error: `Mailjet ${res.status}: ${body.slice(0, 200)}` };
    }
    // Successful response shape:
    //   { Messages: [{ Status: "success", To: [{ MessageID: 123, MessageUUID: "..." }], ... }] }
    const data = (await res.json()) as {
      Messages?: Array<{ Status?: string; To?: Array<{ MessageUUID?: string }> }>;
    };
    const first = data.Messages?.[0];
    const id = first?.To?.[0]?.MessageUUID ?? "(no id)";
    if (first?.Status !== "success") {
      console.error("[email] Mailjet returned non-success status:", JSON.stringify(data).slice(0, 400));
      return { ok: false, error: `Mailjet status: ${first?.Status ?? "unknown"}` };
    }
    return { ok: true, id };
  } catch (err) {
    console.error("[email] fetch failed:", err);
    return { ok: false, error: String(err) };
  }
}
