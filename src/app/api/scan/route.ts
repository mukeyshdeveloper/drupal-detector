import { analyze } from "@/lib/detect";
import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.+$/, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "[::1]"
  ) {
    return true;
  }
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
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
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("That does not look like a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs can be scanned.");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error("That host cannot be scanned.");
  }
  if (parsed.href.length > 2048) {
    throw new Error("URL is too long.");
  }
  return parsed.href;
}

export async function POST(req: Request) {
  let url: string;
  try {
    const body = await req.json();
    url = body.url;
    url = normalizeUrl(url);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid URL", is_drupal: false, score: 0, hits: [] }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    
    const html = (await res.text()).slice(0, 500_000);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    
    const result = analyze(html, headers, url, res.url, res.status);
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error && e.name === "AbortError"
        ? "The site took too long to respond."
        : e instanceof Error
          ? e.message
          : "Could not fetch that page.";
    return NextResponse.json({
      url,
      final_url: url,
      http_status: 0,
      is_drupal: false,
      confidence: "none",
      score: 0,
      version_guess: null,
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
      hits: [],
      error: message,
    });
  } finally {
    clearTimeout(timer);
  }
}
