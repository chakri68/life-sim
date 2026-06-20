import type { Config } from "../core/types";

// Encode/decode a Config to a URL-safe base64 string so whole universes can be
// shared via the location hash. Only the rules/palette/shape are stored — not
// the painted grid (that stays local).

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(b64: string): string {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeConfig(cfg: Config): string {
  return toBase64(JSON.stringify(cfg));
}

export function decodeConfig(encoded: string): Config | null {
  try {
    const cfg = JSON.parse(fromBase64(encoded));
    if (cfg && Array.isArray(cfg.states) && Array.isArray(cfg.rules))
      return cfg as Config;
  } catch {
    /* fall through */
  }
  return null;
}

export function writeUrl(cfg: Config): void {
  history.replaceState(null, "", "#c=" + encodeConfig(cfg));
}

export function readUrl(): Config | null {
  const m = location.hash.match(/c=([^&]+)/);
  return m ? decodeConfig(m[1]) : null;
}
