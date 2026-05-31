// @gcu/capsule — `url:` loader (SPEC-capsule §7.1).
// Body is a percent-encoded absolute HTTPS URL. HTTPS only; never follow an
// HTTPS→HTTP downgrade. The escape hatch for any CORS-open host not covered
// by a named scheme.

import { fetchBytes } from './_fetch.js';

export const urlLoader = async (body, ctx) => {
  let target;
  try { target = decodeURIComponent(body); } catch { throw new Error('EDECODE'); }
  let u;
  try { u = new URL(target); } catch { throw new Error('EDECODE'); }
  if (u.protocol !== 'https:') throw new Error('EFETCH'); // non-HTTPS rejected (§7.1)
  return fetchBytes(u.href, ctx);
};
