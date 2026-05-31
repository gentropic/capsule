// @gcu/capsule — dispatcher (SPEC-capsule §5, §9, §16).
//
// The glue between a capsule string and the loaders. createDispatcher()
// returns a registry pre-wired with all reserved schemes (§3.1); register()
// overwrites (so a shell can swap in a customized loader, e.g. an authed
// gh:), unregister() removes (subsequent resolve → EUNKNOWN). resolve()
// splits the capsule at the first ':', looks up the loader, and invokes it
// with a full ResolutionContext (including a `resolve` back-reference so
// loaders like doi: can delegate).

import { inlineLoader, iLoader, qLoader } from './loaders/inline.js';
import { urlLoader } from './loaders/url.js';
import { ghLoader } from './loaders/gh.js';
import { gistLoader } from './loaders/gist.js';
import { zenodoLoader } from './loaders/zenodo.js';
import { doiLoader } from './loaders/doi.js';
import { rentryLoader } from './loaders/rentry.js';

export function createDispatcher(init = {}) {
  const loaders = new Map();
  const baseOptions = init.options || {};
  const baseOrigin = init.origin
    || (typeof location !== 'undefined' ? location.origin : undefined);

  function resolve(capsule, ctxOverride = {}) {
    let trimmed = capsule && capsule.startsWith('#') ? capsule.slice(1) : capsule;
    if (!trimmed) return Promise.reject(new Error('ENOSCHEME'));
    const idx = trimmed.indexOf(':');
    if (idx < 0) return Promise.reject(new Error('ENOSCHEME'));
    const scheme = trimmed.slice(0, idx);
    const body = trimmed.slice(idx + 1);
    const loader = loaders.get(scheme);
    if (!loader) return Promise.reject(new Error('EUNKNOWN'));
    const ctx = {
      origin: baseOrigin,
      options: baseOptions,
      signal: undefined,
      ...ctxOverride,
      resolve: (p, o) => resolve(p, o || ctxOverride),
    };
    // Loaders MUST surface operational failures as rejected promises (§8.2);
    // wrap so a synchronous throw still becomes a rejection.
    try { return Promise.resolve(loader(body, ctx)); }
    catch (e) { return Promise.reject(e); }
  }

  const dispatcher = {
    register(scheme, loader) { loaders.set(scheme, loader); },
    unregister(scheme) { loaders.delete(scheme); },
    has(scheme) { return loaders.has(scheme); },
    resolve,
  };

  // Default registrations (§3.1). A shell may unregister any of these to
  // shrink its attack surface (§11).
  dispatcher.register('inline', inlineLoader);
  dispatcher.register('i', iLoader);
  dispatcher.register('q', qLoader);
  dispatcher.register('url', urlLoader);
  dispatcher.register('gh', ghLoader);
  dispatcher.register('gist', gistLoader);
  dispatcher.register('zenodo', zenodoLoader);
  dispatcher.register('doi', doiLoader);
  dispatcher.register('rentry', rentryLoader);

  return dispatcher;
}
