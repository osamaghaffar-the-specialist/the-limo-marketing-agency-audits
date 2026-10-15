import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevenueLeakReport, classifyLink } from '../lib/revenue-leak.mjs';
import { isPublicIp, validateBusinessName, validateLeadId, validateTargetUrl } from '../lib/input-validation.mjs';

const target = 'https://example.com/';

function reportFor(links) {
  return buildRevenueLeakReport({
    raw: { links },
    targetUrl: target,
    leadId: 'LD-TEST123',
    businessName: 'Test Chauffeurs',
    engineExitCode: 0
  });
}

test('clean scan is client-delivery eligible and has no high-risk findings', () => {
  const report = reportFor([
    { url: target, parent: '', status: 200, state: 'OK' },
    { url: 'https://example.com/book', parent: target, status: 200, state: 'OK' }
  ]);
  assert.equal(report.summary.status, 'NO_HIGH_RISK_FOUND');
  assert.equal(report.summary.high_risk_revenue_path_findings, 0);
  assert.equal(report.scan_integrity.client_delivery_eligible, true);
});

test('broken booking target is high-risk', () => {
  const report = reportFor([
    { url: target, parent: '', status: 200, state: 'OK' },
    { url: 'https://example.com/book-now', parent: target, status: 404, state: 'BROKEN' }
  ]);
  assert.equal(report.summary.status, 'REVIEW_HIGH_RISK');
  assert.equal(report.summary.high_risk_revenue_path_findings, 1);
  assert.equal(report.top_findings[0].reason, 'BROKEN_CONVERSION_TARGET');
});

test('broken image on booking page is not incorrectly promoted to high-risk', () => {
  const item = classifyLink({
    url: 'https://example.com/assets/fleet-car.jpg',
    parent: 'https://example.com/booking',
    status: 404,
    state: 'BROKEN'
  }, target);
  assert.equal(item.revenue_context, true);
  assert.equal(item.conversion_target, false);
  assert.equal(item.severity, 'MEDIUM');
});

test('blocked 403 is unverified, not broken', () => {
  const report = reportFor([
    { url: target, parent: '', status: 200, state: 'OK' },
    { url: 'https://example.com/book', parent: target, status: 403, state: 'SKIPPED' }
  ]);
  assert.equal(report.summary.broken_links, 0);
  assert.equal(report.summary.blocked_or_unverified_links, 1);
  assert.equal(report.summary.status, 'SCAN_PARTIAL_BLOCKED');
  assert.equal(report.scan_integrity.client_delivery_eligible, false);
});

test('zero-link scan fails closed as inconclusive', () => {
  const report = reportFor([]);
  assert.equal(report.summary.status, 'SCAN_INCONCLUSIVE');
  assert.equal(report.scan_integrity.client_delivery_eligible, false);
});

test('broken homepage is high-risk even without booking keyword', () => {
  const report = reportFor([
    { url: target, parent: '', status: 500, state: 'BROKEN' }
  ]);
  assert.equal(report.summary.status, 'REVIEW_HIGH_RISK');
  assert.equal(report.top_findings[0].reason, 'TARGET_ROOT_FAILURE');
});

test('skipped non-web links are ignored and do not downgrade a clean scan', () => {
  const report = reportFor([
    { url: target, parent: '', status: 200, state: 'OK' },
    { url: 'data:,', parent: target, status: 0, state: 'SKIPPED' },
    { url: 'mailto:test@example.com', parent: target, status: 0, state: 'SKIPPED' }
  ]);
  assert.equal(report.summary.broken_links, 0);
  assert.equal(report.summary.blocked_or_unverified_links, 0);
  assert.equal(report.summary.status, 'NO_HIGH_RISK_FOUND');
  assert.equal(report.scan_integrity.client_delivery_eligible, true);
});

test('lead ID validation blocks path traversal and unsafe characters', () => {
  assert.equal(validateLeadId('LD-ABC_123'), 'LD-ABC_123');
  assert.throws(() => validateLeadId('../../etc/passwd'));
  assert.throws(() => validateLeadId('LD 123'));
});

test('business name allows normal punctuation but rejects control characters', () => {
  assert.equal(validateBusinessName("O'Brien Executive Cars"), "O'Brien Executive Cars");
  assert.throws(() => validateBusinessName('Bad\nName'));
});

test('public IP helper rejects loopback, private and metadata ranges', () => {
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('127.0.0.1'), false);
  assert.equal(isPublicIp('10.0.0.1'), false);
  assert.equal(isPublicIp('169.254.169.254'), false);
  assert.equal(isPublicIp('192.168.1.2'), false);
  assert.equal(isPublicIp('::1'), false);
});

test('target URL validation blocks local targets and accepts a public hostname with safe mocked DNS', async () => {
  const lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  const result = await validateTargetUrl('https://example.com', lookup);
  assert.equal(result, 'https://example.com/');
  await assert.rejects(() => validateTargetUrl('http://127.0.0.1', lookup));
  await assert.rejects(() => validateTargetUrl('http://localhost', lookup));
});
