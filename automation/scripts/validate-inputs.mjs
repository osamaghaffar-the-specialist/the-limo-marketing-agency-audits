import { validateBusinessName, validateLeadId, validateTargetUrl } from '../lib/input-validation.mjs';

const targetUrl = process.env.TARGET_URL || '';
const leadId = process.env.LEAD_ID || '';
const businessName = process.env.BUSINESS_NAME || '';

const validated = {
  target_url: await validateTargetUrl(targetUrl),
  lead_id: validateLeadId(leadId),
  business_name: validateBusinessName(businessName)
};

console.log(JSON.stringify({
  validation: 'PASS',
  target_host: new URL(validated.target_url).hostname,
  lead_id: validated.lead_id,
  business_name_length: validated.business_name.length
}));
