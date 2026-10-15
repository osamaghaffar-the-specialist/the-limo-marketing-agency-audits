import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

const inputPath = args.input || 'raw-linkinator.json';
const outputPath = args.output || 'revenue-leak.json';
const targetUrl = args.url || '';
const leadId = args.lead_id || '';
const businessName = args.business_name || '';

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${inputPath}`);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const links = Array.isArray(raw.links) ? raw.links : [];

const revenuePattern = /(book|booking|reserve|reservation|quote|enquiry|inquiry|contact|airport|transfer|chauffeur|fleet|vehicle|wedding|event|corporate|checkout|pay|payment|whatsapp|wa\.me|tel:|mailto:)/i;

function stateText(link) {
  return String(link.state || '').toUpperCase();
}

function isWebUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function isBroken(link) {
  const state = stateText(link);
  const status = Number(link.status || 0);
  if (state.includes('SKIPPED')) return false;
  if (!isWebUrl(link.url)) return false;
  return state.includes('BROKEN') || status >= 400;
}

function isRevenueRelated(link) {
  return revenuePattern.test(`${link.url || ''} ${link.parent || ''}`);
}

function severity(link) {
  if (isBroken(link) && isRevenueRelated(link)) return 'HIGH';
  if (isBroken(link)) return 'MEDIUM';
  if (/^http:\/\//i.test(link.url || '')) return 'LOW';
  return 'INFO';
}

const findings = links
  .filter((link) => isBroken(link) || isRevenueRelated(link) || /^http:\/\//i.test(link.url || ''))
  .map((link) => ({
    url: link.url || '',
    parent: link.parent || '',
    status: link.status ?? null,
    state: link.state ?? null,
    revenue_related: isRevenueRelated(link),
    broken: isBroken(link),
    severity: severity(link),
    failure_details: link.failureDetails || []
  }));

const highRisk = findings.filter((f) => f.severity === 'HIGH');
const revenueLinks = findings.filter((f) => f.revenue_related);
const brokenLinks = findings.filter((f) => f.broken);

const report = {
  schema_version: 'RLD-V1',
  generated_at: new Date().toISOString(),
  lead_id: leadId,
  business_name: businessName,
  target_url: targetUrl,
  source_engine: 'linkinator',
  claim_safety: {
    revenue_loss_amount_claimed: false,
    ranking_claimed: false,
    conversion_loss_claimed: false,
    wording_rule: 'Report only observed technical path issues. Do not claim monetary loss without separate evidence.'
  },
  summary: {
    scanned_links: links.length,
    broken_links: brokenLinks.length,
    revenue_related_links_observed: revenueLinks.length,
    high_risk_revenue_path_findings: highRisk.length,
    status: highRisk.length > 0 ? 'REVIEW_HIGH_RISK' : 'NO_HIGH_RISK_FOUND'
  },
  top_findings: highRisk.slice(0, 10),
  findings
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));
