import {
  analyze,
  emptyResult,
  isCloudflareChallenge,
  type DetectResult,
} from "@/lib/detect";
import { NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

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
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const html = (await res.text()).slice(0, 500_000);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    if (isCloudflareChallenge(html, headers, res.status)) {
      return NextResponse.json(
        emptyResult(
          target,
          "Cloudflare blocked the server fetch. Open the site in your browser, View Source (Ctrl+U), and paste the HTML below.",
          {
            final_url: res.url,
            http_status: res.status,
            blocked: "cloudflare",
          },
        ),
      );
    }

    return NextResponse.json(analyze(html, headers, target, res.url, res.status));
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
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
