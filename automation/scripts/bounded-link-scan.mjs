import fs from 'node:fs';
import path from 'node:path';
import { LinkChecker } from 'linkinator';
import { validateTargetUrl } from '../lib/input-validation.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

const targetUrl = args.url || '';
const outputPath = args.output || 'raw-linkinator.json';
const maxUrlsRaw = Number(args.max_urls || 150);
const maxUrls = Number.isInteger(maxUrlsRaw) && maxUrlsRaw >= 10 && maxUrlsRaw <= 500 ? maxUrlsRaw : 150;

await validateTargetUrl(targetUrl);

const allowedUrls = new Set();
const validationCache = new Map();
let capReached = false;
let unsafeSkipped = 0;
let overCapSkipped = 0;

async function shouldSkip(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return false;
  url.hash = '';
  const normalized = url.toString();

  if (allowedUrls.has(normalized)) return false;

  if (!validationCache.has(normalized)) {
    validationCache.set(normalized, validateTargetUrl(normalized)
      .then(() => true)
      .catch(() => false));
  }

  const safe = await validationCache.get(normalized);
  if (!safe) {
    unsafeSkipped++;
    return true;
  }

  if (allowedUrls.size >= maxUrls) {
    capReached = true;
    overCapSkipped++;
    return true;
  }

  allowedUrls.add(normalized);
  return false;
}

const checker = new LinkChecker();
const results = await checker.check({
  path: targetUrl,
  recurse: true,
  concurrency: 5,
  timeout: 12000,
  retryErrors: true,
  retryErrorsCount: 1,
  redirects: 'warn',
  requireHttps: 'warn',
  statusCodes: {
    '401': 'skip',
    '403': 'skip',
    '429': 'skip',
    '999': 'skip'
  },
  linksToSkip: shouldSkip
});

const output = {
  ...results,
  scan_meta: {
    bounded: true,
    max_urls: maxUrls,
    allowed_unique_web_urls: allowedUrls.size,
    cap_reached: capReached,
    skipped_for_safety: unsafeSkipped,
    skipped_over_cap: overCapSkipped
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  passed: Boolean(results.passed),
  links: Array.isArray(results.links) ? results.links.length : 0,
  ...output.scan_meta
}));

process.exitCode = results.passed ? 0 : 1;
