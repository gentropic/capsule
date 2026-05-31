// @gcu/capsule — `gist:` loader (SPEC-capsule §7.3).
//   gist:<id>[:<file>]
// Fetches the gist API, returns the named file, else the first file matching
// a shell-supplied default extension, else the first file. Falls back to the
// file's raw_url when the API reports it truncated.

import { fetchBytes, fetchJson } from './_fetch.js';

export const gistLoader = async (body, ctx = {}) => {
  const colon = body.indexOf(':');
  const id = colon < 0 ? body : body.slice(0, colon);
  const wanted = colon < 0 ? null : body.slice(colon + 1);
  if (!id) throw new Error('EDECODE');

  const meta = await fetchJson(`https://api.github.com/gists/${id}`, ctx);
  const files = meta && meta.files;
  if (!files || typeof files !== 'object') throw new Error('ENOTFOUND');
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('ENOTFOUND');

  let pick = null;
  if (wanted) {
    pick = files[wanted];
    if (!pick) throw new Error('ENOTFOUND');
  } else {
    const defExt = ctx.options && ctx.options.gist && ctx.options.gist.defaultExt;
    if (defExt) pick = files[names.find(n => n.endsWith(defExt))];
    if (!pick) pick = files[names[0]];
  }

  if (pick.truncated && pick.raw_url) return fetchBytes(pick.raw_url, ctx);
  return new TextEncoder().encode(pick.content != null ? pick.content : '');
};
