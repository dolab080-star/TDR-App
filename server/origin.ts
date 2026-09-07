type Headers = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The public origin to put in emails. Prefers configuration over request
 * headers so a spoofed Host header can never point a sign-in email at
 * someone else's site.
 */
export function appOrigin(headers: Headers, env: NodeJS.ProcessEnv = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, '');
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const host = first(headers['x-forwarded-host']) || first(headers['host']) || 'localhost';
  const proto = first(headers['x-forwarded-proto']) || 'https';
  return `${proto}://${host}`;
}
