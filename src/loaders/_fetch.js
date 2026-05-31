// @gcu/capsule — shared fetch helper for reference loaders (§8.2).
// Credentialless cross-origin GET; classified errors; forwards the abort
// signal. Reference loaders never opt into credentialed fetches (§22.3).

export async function fetchBytes(url, ctx = {}, { headers } = {}) {
  let res;
  try {
    res = await fetch(url, {
      credentials: 'same-origin',           // anonymous for cross-origin (§22.3)
      redirect: 'follow',
      signal: ctx.signal,
      headers,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new Error('EFETCH');
  }
  if (!res.ok) throw new Error('EHTTP:' + res.status);
  const limit = ctx.options && ctx.options.maxBytes;
  const buf = await res.arrayBuffer();
  if (limit && buf.byteLength > limit) throw new Error('ETOOLARGE');
  return new Uint8Array(buf);
}

export async function fetchJson(url, ctx = {}) {
  const bytes = await fetchBytes(url, ctx);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('EDECODE'); }
}
