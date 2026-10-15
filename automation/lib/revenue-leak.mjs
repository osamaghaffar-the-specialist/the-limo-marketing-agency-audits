const CONVERSION_PATTERN = /(book|booking|reserve|reservation|quote|enquiry|inquiry|contact|checkout|pay|payment|whatsapp|wa\.me|call[-_ ]?us|request[-_ ]?a[-_ ]?ride|get[-_ ]?a[-_ ]?quote)/i;
const SERVICE_CONTEXT_PATTERN = /(airport|transfer|chauffeur|fleet|vehicle|wedding|event|corporate|executive|limo|limousine|car[-_ ]?service)/i;
const BLOCKED_STATUSES = new Set([401, 403, 429, 999]);
const DEFINITIVE_BROKEN_STATUSES = new Set([404, 410]);

function asState(link) {
  return String(link?.state || '').toUpperCase();
}

function asStatus(link) {
  const value = Number(link?.status);
  return Number.isFinite(value) ? value : 0;
}

export function isWebUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizedHost(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizedWebUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    const text = url.toString();
    return text.endsWith('/') ? text.slice(0, -1) : text;
  } catch {
    return String(value || '');
  }
}

export function isBlocked(link) {
  if (!isWebUrl(link?.url)) return false;
  const status = asStatus(link);
  const state = asState(link);
  return BLOCKED_STATUSES.has(status) || state.includes('SKIPPED');
}

export function isBroken(link) {
  if (!isWebUrl(link?.url) || isBlocked(link)) return false;
  const status = asStatus(link);
  const state = asState(link);
  return state.includes('BROKEN') || status >= 400;
}

export function isConversionTarget(link) {
  const text = `${link?.url || ''} ${link?.displayText || ''}`;
  return CONVERSION_PATTERN.test(text);
}

export function isRevenueContext(link) {
  const text = `${link?.url || ''} ${link?.displayText || ''} ${link?.parent || ''}`;
  return CONVERSION_PATTERN.test(text) || SERVICE_CONTEXT_PATTERN.test(text);
}

function isInternal(link, targetUrl) {
  const linkHost = normalizedHost(link?.url || '');
  const targetHost = normalizedHost(targetUrl || '');
  return Boolean(linkHost && targetHost && linkHost === targetHost);
}

function isRootTarget(link, targetUrl) {
  return normalizedWebUrl(link?.url || '') === normalizedWebUrl(targetUrl || '');
}

function confidence(link) {
  const status = asStatus(link);
  if (DEFINITIVE_BROKEN_STATUSES.has(status)) return 'HIGH';
  if (status >= 500 && status <= 599) return 'MEDIUM';
  if (asState(link).includes('BROKEN')) return 'MEDIUM';
  return 'LOW';
}

export function classifyLink(link, targetUrl) {
  const blocked = isBlocked(link);
  const broken = isBroken(link);
  const conversionTarget = isConversionTarget(link);
  const revenueContext = isRevenueContext(link);
  const internal = isInternal(link, targetUrl);
  const rootTarget = isRootTarget(link, targetUrl);
  const insecureHttp = /^http:\/\//i.test(String(link?.url || ''));

  let severity = 'INFO';
  let reason = 'OBSERVED';

  if (blocked) {
    reason = 'UNVERIFIED_BLOCKED';
  } else if (broken && rootTarget) {
    severity = 'HIGH';
    reason = 'TARGET_ROOT_FAILURE';
  } else if (broken && conversionTarget) {
    severity = 'HIGH';
    reason = 'BROKEN_CONVERSION_TARGET';
  } else if (broken && internal && revenueContext) {
    severity = 'MEDIUM';
    reason = 'BROKEN_LINK_IN_REVENUE_CONTEXT';
  } else if (broken && internal) {
    severity = 'MEDIUM';
    reason = 'BROKEN_INTERNAL_LINK';
  } else if (broken) {
    severity = 'LOW';
    reason = 'BROKEN_EXTERNAL_LINK';
  } else if (insecureHttp) {
    severity = 'LOW';
    reason = 'INSECURE_HTTP_LINK';
  }

  return {
    url: link?.url || '',
    display_text: link?.displayText || '',
    parent: link?.parent || '',
    status: link?.status ?? null,
    state: link?.state ?? null,
    internal,
    root_target: rootTarget,
    conversion_target: conversionTarget,
    revenue_context: revenueContext,
    blocked,
    broken,
    insecure_http: insecureHttp,
    severity,
    reason,
    confidence: confidence(link),
    failure_details: Array.isArray(link?.failureDetails) ? link.failureDetails : []
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.url, item.parent, item.status, item.state, item.display_text].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function severityRank(value) {
  return { HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 }[value] || 0;
}

export function buildRevenueLeakReport({ raw, targetUrl, leadId, businessName, engineExitCode = null }) {
  const links = Array.isArray(raw?.links) ? raw.links : [];
  const scanMeta = raw?.scan_meta && typeof raw.scan_meta === 'object' ? raw.scan_meta : {};
  const classified = links.map((link) => classifyLink(link, targetUrl));
  const actionable = dedupe(classified.filter((item) => item.broken || item.blocked || item.insecure_http));
  const broken = actionable.filter((item) => item.broken);
  const blocked = actionable.filter((item) => item.blocked);
  const highRisk = actionable.filter((item) => item.severity === 'HIGH');
  const mediumRisk = actionable.filter((item) => item.severity === 'MEDIUM');
  const revenueObserved = classified.filter((item) => item.revenue_context).length;
  const root = classified.find((item) => item.root_target);

  const webLinks = classified.filter((item) => isWebUrl(item.url));
  const hasUsableScan = webLinks.length > 0;
  const rootBlocked = Boolean(root?.blocked);
  const allObservedBlocked = webLinks.length > 0 && webLinks.every((item) => item.blocked);
  const capReached = scanMeta.cap_reached === true;
  const unsafeSkipped = Number(scanMeta.skipped_for_safety || 0);

  let status = 'NO_HIGH_RISK_FOUND';
  if (!hasUsableScan || allObservedBlocked) {
    status = 'SCAN_INCONCLUSIVE';
  } else if (highRisk.length > 0) {
    status = 'REVIEW_HIGH_RISK';
  } else if (mediumRisk.length > 0) {
    status = 'REVIEW_TECHNICAL_ISSUES';
  } else if (blocked.length > 0 || rootBlocked) {
    status = 'SCAN_PARTIAL_BLOCKED';
  } else if (capReached || unsafeSkipped > 0) {
    status = 'SCAN_PARTIAL_LIMITED';
  }

  const partialCoverage = ['SCAN_INCONCLUSIVE', 'SCAN_PARTIAL_BLOCKED', 'SCAN_PARTIAL_LIMITED'].includes(status);
  const clientDeliveryEligible = !partialCoverage || highRisk.length > 0;
  const negativeClearanceAllowed = !partialCoverage && highRisk.length === 0;
  const sortedTopFindings = [...actionable]
    .filter((item) => item.severity !== 'INFO')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 10);

  return {
    schema_version: 'RLD-V2',
    generated_at: new Date().toISOString(),
    lead_id: leadId,
    business_name: businessName,
    target_url: targetUrl,
    source_engine: 'linkinator',
    scan_integrity: {
      raw_links_array_present: Array.isArray(raw?.links),
      scanned_links: links.length,
      web_links_observed: webLinks.length,
      engine_exit_code: engineExitCode,
      root_target_observed: Boolean(root),
      root_target_blocked: rootBlocked,
      bounded_scan: scanMeta.bounded === true,
      max_urls: Number(scanMeta.max_urls || 0) || null,
      cap_reached: capReached,
      skipped_for_safety: unsafeSkipped,
      skipped_over_cap: Number(scanMeta.skipped_over_cap || 0),
      client_delivery_eligible: clientDeliveryEligible,
      negative_clearance_allowed: negativeClearanceAllowed
    },
    claim_safety: {
      revenue_loss_amount_claimed: false,
      ranking_claimed: false,
      conversion_loss_claimed: false,
      full_site_coverage_claimed: false,
      wording_rule: 'Report only observed technical path issues. Never claim monetary loss, ranking loss, conversion loss, or full-site clearance without separate evidence.'
    },
    summary: {
      scanned_links: links.length,
      unique_actionable_findings: actionable.length,
      broken_links: broken.length,
      blocked_or_unverified_links: blocked.length,
      revenue_related_links_observed: revenueObserved,
      high_risk_revenue_path_findings: highRisk.length,
      medium_risk_findings: mediumRisk.length,
      status
    },
    top_findings: sortedTopFindings,
    findings: actionable
  };
}
