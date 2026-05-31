// @gcu/capsule — `gh:` loader (SPEC-capsule §7.2).
//   gh:<owner>/<repo>[@<ref>]:<path>
// Fetches via jsDelivr by default (stable, cached) or raw.githubusercontent
// when ctx.options.gh.endpoint === 'raw'. ref defaults to HEAD.

import { fetchBytes } from './_fetch.js';

export const ghLoader = async (body, ctx = {}) => {
  // Split owner/repo[@ref] from path at the FIRST ':' — paths can't contain ':'
  // in this grammar, and refs/owners/repos can't either.
  const colon = body.indexOf(':');
  if (colon < 0) throw new Error('EDECODE');
  const locator = body.slice(0, colon);
  const path = body.slice(colon + 1);
  if (!path) throw new Error('EDECODE');

  let repoPart = locator, ref = 'HEAD';
  const at = locator.indexOf('@');
  if (at >= 0) { repoPart = locator.slice(0, at); ref = locator.slice(at + 1) || 'HEAD'; }

  const slash = repoPart.indexOf('/');
  if (slash < 0) throw new Error('EDECODE');
  const owner = repoPart.slice(0, slash);
  const repo = repoPart.slice(slash + 1);
  if (!owner || !repo) throw new Error('EDECODE');

  const endpoint = (ctx.options && ctx.options.gh && ctx.options.gh.endpoint) || 'jsdelivr';
  const url = endpoint === 'raw'
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`
    : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`;
  return fetchBytes(url, ctx);
};
