export interface SigninResult {
  ok: boolean;
  message: string;
}

/** Asks the server to email a sign-in link to the purchase email. */
export async function requestSignin(email: string): Promise<SigninResult> {
  try {
    const res = await fetch('/api/request-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (res.ok && data.ok) return { ok: true, message: `Check your inbox — we sent a sign-in link to ${email}. It works for one hour.` };
    return { ok: false, message: data.message ?? 'Something went wrong. Please try again.' };
  } catch {
    return { ok: false, message: "Couldn't reach the sign-in server. Check your connection and try again." };
  }
}

/** Parse a `?signin=<token>` link from a sign-in email. */
export function pendingSigninToken(search: string): string | null {
  const token = new URLSearchParams(search).get('signin');
  return token && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : null;
}

export async function verifySignin(token: string): Promise<{ ok: boolean; email?: string | null; sessionId?: string }> {
  const res = await fetch('/api/verify-signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string | null; sessionId?: string };
  return { ok: res.ok && data.ok === true, email: data.email, sessionId: data.sessionId };
}
