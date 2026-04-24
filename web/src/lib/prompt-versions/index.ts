/**
 * Prompt version router.
 *
 * To swap the shipped prompt, change `DEFAULT_SUGGEST_PROMPT` and
 * `CURRENT_SUGGESTION_VERSION` below, then re-run `npm run eval` to
 * get a score delta vs the previous version.
 *
 * Keep old versions checked in — they're the regression safety net
 * and the baseline for score comparisons in `./README.md`.
 */

export { SUGGESTION_PROMPT_V1 } from "./v1";
export { SUGGESTION_PROMPT_V2 } from "./v2";
export { SUGGESTION_PROMPT_V3 } from "./v3";

import { SUGGESTION_PROMPT_V1 } from "./v1";
import { SUGGESTION_PROMPT_V2 } from "./v2";
import { SUGGESTION_PROMPT_V3 } from "./v3";

// Aliases for readability when flipping between measured versions.
export const ALL_VERSIONS = {
  "1.0.0": SUGGESTION_PROMPT_V1,
  "2.0.0": SUGGESTION_PROMPT_V2,
  "3.0.0": SUGGESTION_PROMPT_V3,
  "3.1.0": SUGGESTION_PROMPT_V3,
  "3.2.0": SUGGESTION_PROMPT_V3,
};

// ========================================================================
// To flip between versions for A/B measurement via `npm run eval`,
// change the two lines below. No other file needs to change.
// ========================================================================
export const DEFAULT_SUGGEST_PROMPT = SUGGESTION_PROMPT_V3;
export const CURRENT_SUGGESTION_VERSION = "3.2.0";
