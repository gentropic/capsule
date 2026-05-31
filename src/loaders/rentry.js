// @gcu/capsule — `rentry:` loader (SPEC-capsule §7.6).
//   rentry:<paste-id>  →  https://rentry.co/<paste-id>/raw
// Rentry pastes are public; producers should label that at publication (§14).

import { fetchBytes } from './_fetch.js';

export const rentryLoader = async (body, ctx) => {
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new Error('EDECODE');
  return fetchBytes(`https://rentry.co/${body}/raw`, ctx);
};
