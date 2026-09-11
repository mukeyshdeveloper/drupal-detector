export type Hit = {
  where: string;
  name: string;
  value?: string;
  match?: string | null;
  points: number;
};

export type FilesReport = {
  images: string[];
  pdfs: string[];
  docs: string[];
  other_files: string[];
  image_styles: string[];
  private_system_files: string[];
  files_base_detected: boolean;
};

export type DetectResult = {
  url: string;
  final_url: string;
  http_status: number;
  is_drupal: boolean;
  confidence: "high" | "medium" | "low" | "none";
  score: number;
  version_guess: string | null;
  content_types_on_page: string[];
  fields_on_page: string[];
  field_types_on_page: string[];
  views_on_page: string[];
  view_displays_on_page: string[];
  views_fields_on_page: string[];
  panels: { panes: string[]; layouts: string[] };
  blocks_on_page: string[];
  regions_on_page: string[];
  taxonomy_term_ids: string[];
  modules_inferred: string[];
  themes_inferred: string[];
  drupal_settings_keys: string[];
  files: FilesReport;
  hits: Hit[];
  error?: string | null;
};

type HtmlRule = [RegExp, string, number];

const HTML_RULES: HtmlRule[] = [
  [/Drupal\.settings/, "Drupal.settings", 25],
  [/\bdrupalSettings\b/, "drupalSettings (D8+)", 20],
  [/Drupal\.behaviors/, "Drupal.behaviors", 20],
  [/jQuery\.extend\(Drupal\.settings/, "jQuery.extend(Drupal.settings)", 25],
  [/\/sites\/all\/(themes|modules)\//, "/sites/all/", 15],
  [/\/sites\/default\/files\//, "/sites/default/files/", 10],
  [/misc\/drupal\.js/, "misc/drupal.js", 20],
  [/misc\/jquery\.js/, "misc/jquery.js", 8],
  [/\bnode-type-([a-z0-9-]+)/, "node-type-*", 12],
  [/\bnode--type-([a-z0-9-]+)/, "node--type-* (D8+)", 12],
  [/\bfield-name-([a-z0-9-]+)/, "field-name-*", 10],
  [/\bview-id-([a-z0-9_-]+)/, "view-id-*", 12],
  [/\bview-display-id-([a-z0-9_-]+)/, "view-display-id-*", 10],
  [/\bview-dom-id-/, "view-dom-id", 6],
  [/\bpanel-pane\b|\bpane-type-|\bpanel-display\b/, "panels", 10],
  [/\bblock-system-main\b/, "block-system-main", 8],
  [/id=["']node-\d+["']/, "id=node-NID", 8],
  [/\/taxonomy\/term\/\d+/, "/taxonomy/term/NID", 8],
  [/href=["'][^"']*\/node\/\d+/, "/node/NID links", 6],
  [/\bpage-node-type-/, "page-node-type-*", 8],
  [/core\/misc\/drupal\.js/, "D8+ core/misc/drupal.js", 20],
  [/\/core\/(misc|modules|themes|assets)\//, "/core/ assets (D8+)", 15],
  [/data-drupal-selector/, "data-drupal-selector (D8+)", 15],
  [/data-off-canvas-main-canvas/, "data-off-canvas-main-canvas (D8+)", 20],
  [/data-drupal-messages-fallback/, "data-drupal-messages-fallback (D8+)", 20],
  [/data-region=/, "data-region (D8+)", 18],
  [/data-drupal-link-system-path/, "data-drupal-link-system-path (D8+)", 12],
  [/name=["']form_build_id["']/, "form_build_id", 10],
  [/name=["']form_token["']/, "form_token", 8],
  [/\bwebform-client-form\b/, "webform", 8],
  [/\bctools-/, "ctools", 8],
  [/\bviews-exposed-form\b/, "views exposed form", 6],
  [/\bfeed-icon\b/, "feed-icon", 4],
  [/property=["']og:/, "og meta", 4],
];

const META_RULES: [RegExp, number][] = [
  [
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*Drupal[^"']*)["']/i,
    40,
  ],
  [
    /<meta[^>]+content=["']([^"']*Drupal[^"']*)["'][^>]+name=["']generator["']/i,
    40,
  ],
];

const FILE_RE =
  /(?:https?:)?(?:\/\/[^/"'\s]+)?(\/sites\/(?:default|all|[\w.-]+)\/files\/[^"'\s?#]+)/gi;
const PRIVATE_RE = /(\/system\/files\/[^"'\s?#]+)/gi;
const STYLE_RE = /\/files\/styles\/([\w-]+)\//i;
const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico"]);
const DOC_EXT = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".txt",
]);

const MODULE_RULES: [string, RegExp][] = [
  ["Views", /\bview-id-|\bviews-row\b|\bviews-field-|\bblock-views-/],
  ["Panels", /\bpanel-display\b|\bpanel-pane\b|\bpane-/],
  ["CTools", /\bctools-|\bCTools\b/],
  ["Context", /context-region|rendered by context/],
  ["Webform", /\bwebform-client-form\b|\bwebform-component-/],
  ["Media", /\bmedia-element\b|\bfile-icon\b/],
  ["Metatag", /property=["']og:|name=["']twitter:/],
  ["Aggregator/Feeds", /\bfeed-icon\b/],
];

function uniq(arr: string[]): string[] {
  return [...new Set(arr.filter(Boolean))];
}

function extOf(path: string): string {
  const p = path.split("?")[0].toLowerCase();
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i) : "";
}

function versionFrom(text: string): string | null {
  const m = String(text).match(/Drupal\s*([0-9]+)/i);
  return m ? m[1] : null;
}

function headerGet(headers: Record<string, string>, name: string): string {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return "";
}

function extractFiles(html: string): FilesReport {
  const images: string[] = [];
  const pdfs: string[] = [];
  const docs: string[] = [];
  const other: string[] = [];
  const styles = new Set<string>();
  const seen = new Set<string>();
  FILE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_RE.exec(html))) {
    const path = m[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const sm = path.match(STYLE_RE);
    if (sm) styles.add(sm[1]);
    const ext = extOf(path);
    if (IMG_EXT.has(ext)) images.push(path);
    else if (ext === ".pdf") pdfs.push(path);
    else if (DOC_EXT.has(ext)) docs.push(path);
    else other.push(path);
  }
  const privateFiles = uniq([...(html.match(PRIVATE_RE) || [])]);
  return {
    images: images.slice(0, 50),
    pdfs: pdfs.slice(0, 50),
    docs: docs.slice(0, 50),
    other_files: other.slice(0, 30),
    image_styles: [...styles].sort(),
    private_system_files: privateFiles.slice(0, 20),
    files_base_detected: seen.size > 0 || privateFiles.length > 0,
  };
}

function findall(re: RegExp, html: string): string[] {
  const out: string[] = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = r.exec(html))) out.push(m[1] || m[0]);
  return uniq(out);
}

function settingsKeys(html: string): string[] {
  const keys: string[] = [];
  const blobs = html.matchAll(
    /jQuery\.extend\(Drupal\.settings\s*,\s*(\{[\s\S]*?\})\s*\)\s*;/gi,
  );
  for (const blob of blobs) {
    const chunk = (blob[1] || "").slice(0, 8000);
    keys.push(...findall(/"([A-Za-z0-9_]+)"\s*:/g, chunk));
  }
  return uniq(keys).slice(0, 40);
}

export function analyze(
  html: string,
  headers: Record<string, string> = {},
  url = "",
  finalUrl = "",
  status = 200,
): DetectResult {
  const hits: Hit[] = [];
  let score = 0;
  const versionHints: string[] = [];

  const gen = headerGet(headers, "x-generator");
  if (/drupal/i.test(gen)) {
    hits.push({ where: "header", name: "X-Generator", value: gen, points: 40 });
    score += 40;
    const v = versionFrom(gen);
    if (v) versionHints.push(v);
  }

  for (const key of [
    "x-drupal-cache",
    "x-drupal-dynamic-cache",
    "x-drupal-cache-tags",
    "x-drupal-cache-contexts",
  ]) {
    const val = headerGet(headers, key);
    if (val) {
      hits.push({ where: "header", name: key, value: val, points: 25 });
      score += 25;
      versionHints.push("8+");
    }
  }

  const expires = headerGet(headers, "expires");
  if (/19 Nov 1978/i.test(expires)) {
    hits.push({
      where: "header",
      name: "Expires 1978 (Drupal default)",
      value: expires,
      points: 12,
    });
    score += 12;
  }

  const cookie = headers["set-cookie"] || headers["Set-Cookie"] || "";
  if (/\bSESS[a-zA-Z0-9]{16,}/.test(cookie)) {
    hits.push({ where: "cookie", name: "SESS cookie", points: 8 });
    score += 8;
  }
  if (/\bSSESS[a-zA-Z0-9]{16,}/.test(cookie)) {
    hits.push({ where: "cookie", name: "SSESS cookie", points: 8 });
    score += 8;
  }

  for (const [re, pts] of META_RULES) {
    const m = html.match(re);
    if (m) {
      hits.push({
        where: "meta",
        name: "generator",
        value: m[1] || m[0],
        points: pts,
      });
      score += pts;
      const v = versionFrom(m[1] || "");
      if (v) versionHints.push(v);
      break;
    }
  }

  const seen = new Set<string>();
  for (const [re, name, pts] of HTML_RULES) {
    const m = html.match(re);
    if (m && !seen.has(name)) {
      seen.add(name);
      hits.push({
        where: "html",
        name,
        match: m[1] || null,
        points: pts,
      });
      score += pts;
    }
  }

  const files = extractFiles(html);
  if (files.files_base_detected) {
    score += 10;
    hits.push({ where: "html", name: "/sites/*/files/", points: 10 });
  }

  const d8 = hits.some((h) => /D8\+|drupalSettings|x-drupal/i.test(h.name));
  const d67 = hits.some((h) =>
    ["node-type-*", "Drupal.settings", "misc/drupal.js"].includes(h.name),
  );
  if (d8) versionHints.push("8+");
  else if (d67) versionHints.push("6/7");

  score = Math.min(score, 100);
  let confidence: DetectResult["confidence"] = "none";
  let is_drupal = false;
  if (d8) {
    is_drupal = true;
    confidence = score >= 40 ? "high" : "medium";
  } else if (score >= 50) {
    confidence = "high";
    is_drupal = true;
  } else if (score >= 25) {
    confidence = "medium";
    is_drupal = true;
  } else if (score >= 12) confidence = "low";

  let vg: string | null =
    versionHints.find((v) => /^\d+$/.test(String(v))) || versionHints[0] || null;
  if (d8 && (!vg || vg === "6" || vg === "7" || vg === "6/7")) vg = "8+";

  return {
    url,
    final_url: finalUrl,
    http_status: status,
    is_drupal,
    confidence,
    score,
    version_guess: vg,
    content_types_on_page: [
      ...findall(/\bnode-type-([a-z0-9-]+)/gi, html),
      ...findall(/\bnode--type-([a-z0-9-]+)/gi, html),
    ],
    fields_on_page: findall(/\bfield-name-([a-z0-9-]+)/gi, html),
    field_types_on_page: findall(/\bfield-type-([a-z0-9-]+)/gi, html),
    views_on_page: findall(/\bview-id-([a-z0-9_-]+)/gi, html),
    view_displays_on_page: findall(/\bview-display-id-([a-z0-9_-]+)/gi, html),
    views_fields_on_page: findall(/\bviews-field-([a-z0-9_-]+)/gi, html).slice(
      0,
      40,
    ),
    panels: {
      panes: findall(/\bpane-([a-z0-9_-]+)/gi, html).slice(0, 30),
      layouts: findall(
        /\b(panel-(?:\dcol|1col|2col|3col)[a-z0-9_-]*|panels-flexible)\b/gi,
        html,
      ),
    },
    blocks_on_page: findall(/id=["'](block-[a-z0-9_-]+)["']/gi, html).slice(
      0,
      40,
    ),
    regions_on_page: findall(/\bregion-([a-z0-9_-]+)/gi, html),
    taxonomy_term_ids: findall(/\/taxonomy\/term\/(\d+)/gi, html).slice(0, 30),
    modules_inferred: MODULE_RULES.filter(([, re]) => re.test(html)).map(
      ([n]) => n,
    ),
    themes_inferred: findall(/\/sites\/all\/themes\/([a-z0-9_-]+)\//gi, html),
    drupal_settings_keys: settingsKeys(html),
    files,
    hits,
    error: null,
  };
}
