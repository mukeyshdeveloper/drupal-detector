import {
  analyze,
  emptyResult,
  isCloudflareChallenge,
  type DetectResult,
  type Hit,
} from "@/lib/detect";
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const PROBE_TIMEOUT = 8_000; // ms per probe (they all run in parallel)

// ─── URL validation ───────────────────────────────────────────────────────────

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.+$/, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "[::1]"
  ) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a URL to scan.");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try { parsed = new URL(withScheme); }
  catch { throw new Error("That does not look like a valid URL."); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("Only http and https URLs can be scanned.");
  if (isBlockedHost(parsed.hostname))
    throw new Error("That host cannot be scanned.");
  if (parsed.href.length > 2048) throw new Error("URL is too long.");
  return parsed.href;
}

// ─── Probe engine ─────────────────────────────────────────────────────────────

type Tier = "definitive" | "strong" | "weak";
type ProbeHit = { name: string; tier: Tier; version?: string };

async function probe(
  url: string,
  check: (text: string, status: number, ct: string) => ProbeHit | null,
): Promise<ProbeHit | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Cache-Control": "no-cache" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const text = (await res.text()).slice(0, 65_000);
    const ct = res.headers.get("content-type") ?? "";
    return check(text, res.status, ct);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function runProbes(
  url: string,
  originalUrl: string,
): Promise<DetectResult | null> {
  const base = new URL(url).origin; // e.g. https://www.qed42.com

  const settled = await Promise.allSettled([
    // ── D8+ definitive ──────────────────────────────────────────────────────
    probe(`${base}/core/misc/drupal.js`, (text, status) =>
      status === 200 &&
      (text.includes("Drupal.behaviors") || text.includes("drupalSettings"))
        ? { name: "core/misc/drupal.js", tier: "definitive", version: "8+" }
        : null,
    ),

    // ── D6/7 definitive ─────────────────────────────────────────────────────
    probe(`${base}/misc/drupal.js`, (text, status) =>
      status === 200 &&
      (text.includes("Drupal.behaviors") || text.includes("Drupal.settings"))
        ? { name: "misc/drupal.js", tier: "definitive", version: "6/7" }
        : null,
    ),

    // ── D8+ strong — JSON:API endpoint ──────────────────────────────────────
    probe(`${base}/jsonapi`, (text, status, ct) =>
      status === 200 && ct.includes("json")
        ? { name: "/jsonapi endpoint", tier: "strong", version: "8+" }
        : null,
    ),

    // ── All versions — robots.txt Drupal paths ───────────────────────────────
    probe(`${base}/robots.txt`, (text, status) => {
      if (status !== 200) return null;
      const drupalPaths = [
        "/admin/",
        "/user/register",
        "/user/password",
        "/user/login",
        "/filter/tips",
      ];
      const hits = drupalPaths.filter((p) => text.includes(p)).length;
      if (hits >= 2) return { name: "robots.txt (Drupal paths)", tier: "strong" };
      if (hits === 1) return { name: "robots.txt (1 Drupal path)", tier: "weak" };
      return null;
    }),

    // ── All versions — /user/login form ─────────────────────────────────────
    probe(`${base}/user/login`, (text, status) => {
      if (status !== 200) return null;
      if (
        text.includes('id="user-login-form"') ||
        text.includes('id="user-login"')
      )
        return { name: "/user/login form", tier: "strong" };
      if (text.includes("data-drupal-selector"))
        return { name: "/user/login data-drupal-selector", tier: "strong", version: "8+" };
      return null;
    }),

    // ── D6/7 definitive — CHANGELOG.txt ─────────────────────────────────────
    probe(`${base}/CHANGELOG.txt`, (text, status) => {
      if (status !== 200) return null;
      const m = text.match(/Drupal\s+(\d+(?:\.\d+)+)/i);
      if (m)
        return {
          name: "CHANGELOG.txt",
          tier: "definitive",
          version: m[1].split(".")[0],
        };
      return null;
    }),

    // ── D8+ definitive — core/CHANGELOG.txt ─────────────────────────────────
    probe(`${base}/core/CHANGELOG.txt`, (text, status) => {
      if (status !== 200) return null;
      const m = text.match(/Drupal\s+(\d+(?:\.\d+)+)/i);
      if (m)
        return {
          name: "core/CHANGELOG.txt",
          tier: "definitive",
          version: m[1].split(".")[0],
        };
      return null;
    }),

    // ── All versions — /sites/default/files/ ────────────────────────────────
    probe(`${base}/sites/default/files/`, (_, status) => {
      if (status === 403)
        return { name: "/sites/default/files/ (403)", tier: "strong" };
      if (status === 200)
        return { name: "/sites/default/files/ (200)", tier: "weak" };
      return null;
    }),
  ]);

  // Collect successful hits
  const hits: ProbeHit[] = settled
    .filter(
      (r): r is PromiseFulfilledResult<ProbeHit | null> =>
        r.status === "fulfilled" && r.value !== null,
    )
    .map((r) => r.value!);

  if (hits.length === 0) return null;

  // Score
  const definitive = hits.filter((h) => h.tier === "definitive");
  const strong = hits.filter((h) => h.tier === "strong");
  const weak = hits.filter((h) => h.tier === "weak");

  let score = 0;
  let is_drupal = false;
  let confidence: DetectResult["confidence"] = "none";

  if (definitive.length > 0) {
    score = 90;
    is_drupal = true;
    confidence = "high";
  } else if (strong.length >= 2) {
    score = 70;
    is_drupal = true;
    confidence = "high";
  } else if (strong.length === 1) {
    score = 40;
    is_drupal = true;
    confidence = "medium";
  } else if (weak.length >= 2) {
    score = 20;
    confidence = "low";
  }

  // Version — first definitive version hint wins, then strong
  const versionHit =
    definitive.find((h) => h.version) ?? strong.find((h) => h.version);
  const version_guess = versionHit?.version ?? null;

  // Build Hit[] for the fingerprint table
  const resultHits: Hit[] = hits.map((h) => ({
    where: "probe",
    name: h.name,
    value: h.version,
    points: h.tier === "definitive" ? 40 : h.tier === "strong" ? 25 : 10,
  }));

  return {
    url: originalUrl,
    final_url: url,
    http_status: 0,
    is_drupal,
    confidence,
    score,
    version_guess,
    content_types_on_page: [],
    fields_on_page: [],
    field_types_on_page: [],
    views_on_page: [],
    view_displays_on_page: [],
    views_fields_on_page: [],
    panels: { panes: [], layouts: [] },
    blocks_on_page: [],
    regions_on_page: [],
    taxonomy_term_ids: [],
    modules_inferred: [],
    themes_inferred: [],
    drupal_settings_keys: [],
    files: {
      images: [],
      pdfs: [],
      docs: [],
      other_files: [],
      image_styles: [],
      private_system_files: [],
      files_base_detected: false,
    },
    hits: resultHits,
    error: null,
    blocked: null,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse<DetectResult>> {
  let target: string;
  try {
    const body = await req.json();
    target = normalizeUrl(body.url);
  } catch (e) {
    return NextResponse.json(
      emptyResult("", e instanceof Error ? e.message : "Invalid URL"),
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const html = (await res.text()).slice(0, 500_000);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    if (isCloudflareChallenge(html, headers, res.status)) {
      // Homepage is blocked — try probing sub-paths (often unprotected)
      const probeResult = await runProbes(res.url || target, target);
      if (probeResult) return NextResponse.json(probeResult);

      // All probes failed too — ask user to paste source
      return NextResponse.json(
        emptyResult(
          target,
          "Cloudflare blocked the server fetch. Open the site in your browser, View Source (Ctrl+U), and paste the HTML below.",
          { final_url: res.url, http_status: res.status, blocked: "cloudflare" },
        ),
      );
    }

    return NextResponse.json(analyze(html, headers, target, res.url, res.status));
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";

    if (aborted) {
      // Timeout often means CF is stalling — still try probes
      const probeResult = await runProbes(target, target);
      if (probeResult) return NextResponse.json(probeResult);
    }

    return NextResponse.json(
      emptyResult(
        target,
        aborted
          ? "The site took too long to respond (often Cloudflare stalling). Paste the page source instead."
          : e instanceof Error
            ? e.message
            : "Could not fetch that page.",
        { blocked: aborted ? "timeout" : "fetch" },
      ),
    );
  } finally {
    clearTimeout(timer);
  }
}
