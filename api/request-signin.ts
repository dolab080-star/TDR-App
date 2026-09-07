/**
 * "Already bought? Sign in": looks the email up in Stripe for a paid
 * one-time Checkout Session and, if there is one, emails a one-hour
 * sign-in link. Needs STRIPE_SECRET_KEY, SIGNIN_SECRET, RESEND_API_KEY and
 * MAIL_FROM (see README "Sign-in emails").
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { normalizeEmail, signToken } from '../server/signin';
import { appOrigin } from '../server/origin';

async function findPaidSession(stripe: Stripe, email: string): Promise<Stripe.Checkout.Session | undefined> {
  const sessions = await stripe.checkout.sessions.list({ customer_details: { email }, status: 'complete', limit: 20 });
  return sessions.data.find((s) => s.mode === 'payment' && s.payment_status === 'paid');
}

async function sendLink(apiKey: string, from: string, to: string, link: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your Tesla Dance Revolution sign-in link',
      text: `Open this link to sign in to Tesla Dance Revolution on this device:\n\n${link}\n\nIt works for one hour. If you didn't request it, you can ignore this email.`,
      html: `<p>Open this link to sign in to <b>Tesla Dance Revolution</b> on this device:</p><p><a href="${link}">${link}</a></p><p>It works for one hour. If you didn't request it, you can ignore this email.</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { STRIPE_SECRET_KEY, SIGNIN_SECRET, RESEND_API_KEY, MAIL_FROM } = process.env;
  if (!STRIPE_SECRET_KEY || !SIGNIN_SECRET || !RESEND_API_KEY || !MAIL_FROM) {
    res.status(503).json({ error: 'not_configured', message: "Email sign-in isn't set up yet — use the link from your purchase instead." });
    return;
  }

  const body = (req.body ?? {}) as { email?: unknown };
  const email = normalizeEmail(body.email);
  if (!email) {
    res.status(400).json({ error: 'bad_email', message: 'Enter a valid email address.' });
    return;
  }

  let session: Stripe.Checkout.Session | undefined;
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY);
    session = await findPaidSession(stripe, email);
    const typed = typeof body.email === 'string' ? body.email.trim() : '';
    if (!session && typed && typed !== email) session = await findPaidSession(stripe, typed);
  } catch (err) {
    console.error('request-signin: Stripe lookup failed', err);
    res.status(502).json({ error: 'lookup_failed', message: "Couldn't check that purchase right now. Please try again in a minute." });
    return;
  }

  if (!session) {
    res.status(404).json({
      error: 'no_purchase',
      message: "We couldn't find a purchase under that email. Check the receipt Stripe emailed you for the address you used.",
    });
    return;
  }

  try {
    const token = signToken({ email, sessionId: session.id }, SIGNIN_SECRET);
    const link = `${appOrigin(req.headers)}/?signin=${encodeURIComponent(token)}`;
    await sendLink(RESEND_API_KEY, MAIL_FROM, email, link);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('request-signin: sending failed', err);
    res.status(502).json({ error: 'send_failed', message: "Couldn't send the sign-in email right now. Please try again in a minute." });
  }
}
