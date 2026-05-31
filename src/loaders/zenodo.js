// @gcu/capsule — `zenodo:` loader (SPEC-capsule §7.4).
//   zenodo:<record-id>[:<file>]
// Fetches the record, then the named file's content endpoint. File selection
// when omitted mirrors gist (default-ext, then first file). Pinning is the
// caller's concern: use a version-specific record id (§7.4).

import { fetchBytes, fetchJson } from './_fetch.js';

export const zenodoLoader = async (body, ctx = {}) => {
  const colon = body.indexOf(':');
  const id = colon < 0 ? body : body.slice(0, colon);
  const wanted = colon < 0 ? null : body.slice(colon + 1);
  if (!id) throw new Error('EDECODE');

  const rec = await fetchJson(`https://zenodo.org/api/records/${id}`, ctx);
  const files = (rec && rec.files) || [];
  if (!Array.isArray(files) || files.length === 0) throw new Error('ENOTFOUND');

  const keyOf = f => f.key || f.filename || (f.links && f.links.self && f.links.self.split('/').pop());
  let pick = null;
  if (wanted) {
    pick = files.find(f => keyOf(f) === wanted);
    if (!pick) throw new Error('ENOTFOUND');
  } else {
    const defExt = ctx.options && ctx.options.zenodo && ctx.options.zenodo.defaultExt;
    if (defExt) pick = files.find(f => (keyOf(f) || '').endsWith(defExt));
    if (!pick) pick = files[0];
  }

  const key = keyOf(pick);
  const contentUrl = (pick.links && (pick.links.content || pick.links.download))
    || `https://zenodo.org/api/records/${id}/files/${encodeURIComponent(key)}/content`;
  return fetchBytes(contentUrl, ctx);
};
