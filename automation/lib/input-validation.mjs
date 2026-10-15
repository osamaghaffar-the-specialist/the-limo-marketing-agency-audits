import dns from 'node:dns/promises';
import net from 'node:net';

function hasControlChars(value) {
  return /[\u0000-\u001F\u007F]/.test(String(value || ''));
}

function isPublicIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 192 && b === 0 && parts[2] === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && parts[2] === 100) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicIpv6(ip) {
  const value = ip.toLowerCase();
  if (value === '::' || value === '::1') return false;
  if (value.startsWith('fc') || value.startsWith('fd')) return false;
  if (/^fe[89ab]/.test(value)) return false;
  if (value.startsWith('ff')) return false;
  if (value.startsWith('2001:db8:')) return false;
  return true;
}

export function isPublicIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPublicIpv4(ip);
  if (family === 6) return isPublicIpv6(ip);
  return false;
}

export function validateLeadId(value) {
  const leadId = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(leadId)) {
    throw new Error('lead_id must contain only letters, numbers, underscore, or hyphen and be 1-80 characters long.');
  }
  return leadId;
}

export function validateBusinessName(value) {
  const businessName = String(value || '').trim();
  if (!businessName || businessName.length > 160 || hasControlChars(businessName)) {
    throw new Error('business_name must be 1-160 characters and contain no control characters.');
  }
  return businessName;
}

export async function validateTargetUrl(value, lookup = dns.lookup) {
  const text = String(value || '').trim();
  if (!text || text.length > 2048 || hasControlChars(text)) {
    throw new Error('target_url is empty, too long, or contains control characters.');
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('target_url is not a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('target_url must use http or https.');
  }
  if (url.username || url.password) {
    throw new Error('target_url must not contain embedded credentials.');
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('target_url hostname is not allowed.');
  }

  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error('target_url must resolve to a public internet address.');
    return url.toString();
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('target_url hostname did not resolve.');
  }
  if (records.some((record) => !isPublicIp(record.address))) {
    throw new Error('target_url resolved to a non-public address and was blocked.');
  }

  return url.toString();
}
