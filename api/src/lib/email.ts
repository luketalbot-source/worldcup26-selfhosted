// Resend email helper. Used right now only by the admin-login flow to
// deliver one-time login codes; could grow to support other transactional
// emails (e.g. league invites) later.
//
// Resend takes a Bearer key (from RESEND_API_KEY) and a verified
// from-address. Until we verify a Flip-owned domain at Resend, the from
// address is `onboarding@resend.dev` — Resend's default sender, which
// only delivers to email addresses associated with the API-key owner's
// Resend account. That's fine for early testing with the project owner's
// email; for the full CS team allowlist we'll need a verified sender
// (set RESEND_FROM to the verified address once the domain is set up).

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const from = process.env.RESEND_FROM || "Football 2026 <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] Resend rejected:", res.status, body);
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? "(no id)" };
  } catch (err) {
    console.error("[email] fetch failed:", err);
    return { ok: false, error: String(err) };
  }
}
