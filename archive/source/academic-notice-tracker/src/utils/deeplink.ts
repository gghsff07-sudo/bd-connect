/**
 * Deep-link parsing for notice routes.
 *
 * The app registers the URI scheme `notices`, so a link such as
 * `notices://notice/abc123` maps to the route `/notice/abc123`.
 * We parse with plain string handling (rather than the URL polyfill)
 * to keep this deterministic across platforms and test environments.
 */

const SCHEME_PREFIX = 'notices://';
const NOTICE_SEGMENT = 'notice';

/**
 * Extract a notice id from a deep-link URL.
 * Accepted forms:
 *   notices://notice/<id>
 *   notices:///notice/<id>       (some launchers normalise to an empty host)
 *   notices://notice/<id>?utm=…
 * Returns null for anything else (other schemes, missing id, malformed).
 */
export function parseNoticeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let rest = url.trim();
  if (!rest.toLowerCase().startsWith(SCHEME_PREFIX)) return null;
  rest = rest.slice(SCHEME_PREFIX.length);
  // Strip any query string or fragment.
  rest = rest.split(/[?#]/)[0] ?? '';
  const parts = rest.split('/').filter((part) => part.length > 0);
  if (parts[0] !== NOTICE_SEGMENT) return null;
  const id = parts[1];
  if (!id) return null;
  return id;
}

/** Build a deep-link URL for a notice id. */
export function buildNoticeUrl(noticeId: string): string {
  return `${SCHEME_PREFIX}${NOTICE_SEGMENT}/${noticeId}`;
}
