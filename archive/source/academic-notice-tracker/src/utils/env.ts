/**
 * Build-time environment values.
 *
 * EXPO_PUBLIC_* variables are inlined into the JS bundle at build time.
 * Copy `.env.example` to `.env` and fill in the values before building.
 * None of these are secrets; the app contains no API keys.
 */

export const OWNER_EMAIL: string = (process.env.EXPO_PUBLIC_OWNER_EMAIL ?? '')
  .trim()
  .toLowerCase();

export const GOOGLE_WEB_CLIENT_ID: string = (
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''
).trim();
