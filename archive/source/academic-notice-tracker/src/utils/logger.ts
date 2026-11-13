/**
 * Small logger wrapper. Console only — no analytics, no crash reporting,
 * no third-party services. Debug output is stripped outside development.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

function log(level: Level, ...args: unknown[]): void {
  if (level === 'debug' && !isDev) return;
  const fn = level === 'debug' ? 'log' : level;
  console[fn](`[notice-tracker:${level}]`, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
};
