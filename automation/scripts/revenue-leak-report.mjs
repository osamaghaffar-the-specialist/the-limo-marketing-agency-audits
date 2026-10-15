import fs from 'node:fs';
import path from 'node:path';
import { buildRevenueLeakReport } from '../lib/revenue-leak.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

const inputPath = args.input || 'raw-linkinator.json';
const outputPath = args.output || 'revenue-leak.json';
const targetUrl = args.url || '';
const leadId = args.lead_id || '';
const businessName = args.business_name || '';
const engineExitCode = args.engine_exit_code === undefined ? null : Number(args.engine_exit_code);

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input file not found: ${inputPath}`);
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  throw new Error(`Input JSON is invalid: ${error.message}`);
}

const report = buildRevenueLeakReport({
  raw,
  targetUrl,
  leadId,
  businessName,
  engineExitCode: Number.isFinite(engineExitCode) ? engineExitCode : null
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));

if (report.summary.status === 'SCAN_INCONCLUSIVE') {
  process.exitCode = 2;
}
