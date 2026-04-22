/**
 * Minimal .env loader for the eval scripts.
 *
 * tsx does not auto-load .env files the way `next dev` does. This walks up
 * from the script and layers the first matching file into process.env.
 * Existing process.env values always win (so `GROQ_API_KEY=... npm run eval`
 * still overrides).
 *
 * Intentionally dependency-free — we're not adding `dotenv` for this.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = dirname(here);
  const repoRoot = dirname(webRoot);

  const candidates = [
    join(webRoot, ".env.local"),
    join(webRoot, ".env"),
    join(repoRoot, ".env.local"),
    join(repoRoot, ".env"),
    join(repoRoot, "scripts", ".env"),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const parsed = parseEnvFile(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}
