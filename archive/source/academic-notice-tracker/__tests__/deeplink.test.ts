/**
 * Deep-link parsing tests for notices://notice/{id} URLs.
 */
import { buildNoticeUrl, parseNoticeIdFromUrl } from '../src/utils/deeplink';

describe('parseNoticeIdFromUrl', () => {
  it('parses the canonical form', () => {
    expect(parseNoticeIdFromUrl('notices://notice/abc123')).toBe('abc123');
  });

  it('parses the triple-slash form some launchers produce', () => {
    expect(parseNoticeIdFromUrl('notices:///notice/abc123')).toBe('abc123');
  });

  it('strips query strings and fragments', () => {
    expect(parseNoticeIdFromUrl('notices://notice/abc123?utm_source=push')).toBe('abc123');
    expect(parseNoticeIdFromUrl('notices://notice/abc123#fragment')).toBe('abc123');
  });

  it('rejects missing ids', () => {
    expect(parseNoticeIdFromUrl('notices://notice/')).toBeNull();
    expect(parseNoticeIdFromUrl('notices://notice')).toBeNull();
  });

  it('rejects other routes and schemes', () => {
    expect(parseNoticeIdFromUrl('notices://settings')).toBeNull();
    expect(parseNoticeIdFromUrl('notices://other/abc')).toBeNull();
    expect(parseNoticeIdFromUrl('exp://notice/abc')).toBeNull();
    expect(parseNoticeIdFromUrl('https://example.com/notice/abc')).toBeNull();
  });

  it('handles null/undefined/empty input', () => {
    expect(parseNoticeIdFromUrl(null)).toBeNull();
    expect(parseNoticeIdFromUrl(undefined)).toBeNull();
    expect(parseNoticeIdFromUrl('')).toBeNull();
    expect(parseNoticeIdFromUrl('   ')).toBeNull();
  });

  it('round-trips with buildNoticeUrl', () => {
    expect(parseNoticeIdFromUrl(buildNoticeUrl('xyz-42'))).toBe('xyz-42');
  });
});
