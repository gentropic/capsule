// @gcu/capsule — `doi:` loader (SPEC-capsule §7.5).
//   doi:<prefix>/<suffix>[#<file>]
// Resolves the DOI to its hosting system and delegates to a recognized
// downstream loader (currently Zenodo) via ctx.resolve. The `#file` suffix
// (inside the capsule body, not a second URL fragment) becomes the file
// selector for the downstream scheme. Unknown hosts → EUNSUPPORTEDDOI.

export const doiLoader = async (body, ctx = {}) => {
  let name = body, file = null;
  const hash = body.indexOf('#');
  if (hash >= 0) { name = body.slice(0, hash); file = body.slice(hash + 1); }
  if (!name.includes('/')) throw new Error('EDECODE');

  let res;
  try {
    res = await fetch(`https://doi.org/${name}`, {
      method: 'GET', redirect: 'follow', credentials: 'same-origin', signal: ctx.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new Error('EFETCH');
  }
  const dest = res.url || '';

  // Zenodo: .../record(s)/<id> — hand off to the zenodo scheme through the
  // dispatcher so its file-selection + content endpoint logic is reused.
  const z = dest.match(/zenodo\.org\/(?:record|records)\/(\d+)/);
  if (z) {
    if (typeof ctx.resolve !== 'function') throw new Error('EUNSUPPORTEDDOI');
    return ctx.resolve('zenodo:' + z[1] + (file ? ':' + file : ''));
  }
  throw new Error('EUNSUPPORTEDDOI'); // unrecognized host — caller may retry with url:
};
