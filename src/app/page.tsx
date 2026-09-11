"use client";

import { useState } from "react";
import { Radar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyze, emptyResult, type DetectResult } from "@/lib/detect";

const SAMPLE = "https://portableapps.com/";

export default function Home() {
  const [mode, setMode] = useState<"url" | "source">("url");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectResult | null>(null);

  async function runUrlScan(target = url) {
    if (!target.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        body: JSON.stringify({ url: target }),
        headers: { "Content-Type": "application/json" },
      });
      const data: DetectResult = await res.json();
      setResult(data);
      if (data.blocked === "cloudflare" || data.blocked === "timeout") {
        setMode("source");
      }
    } catch (e) {
      setResult(
        emptyResult(target, e instanceof Error ? e.message : "Scan failed", {
          blocked: "fetch",
        }),
      );
      setMode("source");
    } finally {
      setLoading(false);
    }
  }

  function runSourceScan() {
    if (!source.trim()) return;
    const data = analyze(
      source,
      {},
      url || "pasted-source",
      url || "pasted-source",
      200,
    );
    setResult(data);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 flex items-start gap-3 sm:mb-10">
        <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-fg">
          <Radar className="size-5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="font-mono text-xs tracking-wide text-muted uppercase">
            Public source scan
          </p>
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">
            Drupal Trace
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Scan a URL, or paste HTML if Cloudflare blocks the fetch. Fingerprints
            come from generator tags, data attributes, views, fields, and file paths.
          </p>
        </div>
      </header>

      <div className="mb-3 flex gap-1 rounded-lg bg-elevated p-1 w-fit">
        <button
          type="button"
          className={`h-9 rounded-md px-4 text-sm font-medium transition-colors ${mode === "url" ? "bg-surface text-fg" : "text-muted hover:text-fg"}`}
          onClick={() => setMode("url")}
        >
          URL
        </button>
        <button
          type="button"
          className={`h-9 rounded-md px-4 text-sm font-medium transition-colors ${mode === "source" ? "bg-surface text-fg" : "text-muted hover:text-fg"}`}
          onClick={() => setMode("source")}
        >
          Paste source
        </button>
      </div>

      {mode === "url" ? (
        <form
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-panel sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            void runUrlScan();
          }}
        >
          <Input
            id="scan-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            autoComplete="url"
            inputMode="url"
            aria-label="Site URL"
            className="sm:flex-1"
          />
          <Button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full sm:w-auto"
          >
            <Search className="size-4" />
            {loading ? "Scanning…" : "Scan"}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-panel"
          onSubmit={(e) => {
            e.preventDefault();
            runSourceScan();
          }}
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Optional URL label (for reference)"
            aria-label="Optional URL"
          />
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Paste View Source HTML here (Ctrl+U on the live site)"
            aria-label="Page HTML"
            rows={8}
            className="w-full resize-y rounded-md border border-border bg-elevated px-4 py-3 font-mono text-xs text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          />
          <Button
            type="submit"
            disabled={!source.trim()}
            className="w-full sm:w-auto sm:self-end"
          >
            <Search className="size-4" />
            Analyze source
          </Button>
        </form>
      )}

      <p className="mt-3 text-xs text-subtle">
        Try{" "}
        <button
          type="button"
          className="font-mono text-fg underline-offset-2 hover:underline"
          onClick={() => {
            setMode("url");
            setUrl(SAMPLE);
            void runUrlScan(SAMPLE);
          }}
        >
          portableapps.com
        </button>{" "}
        (Drupal 7). Cloudflare sites like qed42.com usually need Paste source.
      </p>

      {!result && !loading && <EmptyHints />}
      {loading && <LoadingPanel />}
      {result && !loading && (
        <ResultPanel result={result} onPaste={() => setMode("source")} />
      )}
    </main>
  );
}

function EmptyHints() {
  const items = [
    {
      k: "Version",
      v: "Generator meta, Drupal.settings vs drupalSettings, node-type vs node--type",
    },
    {
      k: "Structure",
      v: "Content types, fields, views, taxonomy terms, blocks, regions",
    },
    {
      k: "Files",
      v: "sites/default/files images, PDFs, image styles, private /system/files",
    },
  ];
  return (
    <section className="mt-10 grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.k}
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h2 className="text-sm font-medium">{item.k}</h2>
          <p className="mt-2 text-sm text-muted">{item.v}</p>
        </article>
      ))}
    </section>
  );
}

function LoadingPanel() {
  return (
    <section className="mt-10 rounded-xl border border-border bg-surface p-6">
      <p className="font-mono text-sm text-muted">
        Fetching HTML and matching fingerprints…
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-sm bg-elevated">
        <div className="h-full w-1/2 animate-pulse bg-accent/80" />
      </div>
    </section>
  );
}

function ResultPanel({
  result,
  onPaste,
}: {
  result: DetectResult;
  onPaste: () => void;
}) {
  if (result.error) {
    return (
      <section className="mt-8 rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-no">{result.error}</p>
        {(result.blocked === "cloudflare" ||
          result.blocked === "timeout" ||
          result.blocked === "fetch") && (
          <p className="mt-3 text-sm text-muted">
            Open the site in your browser, press{" "}
            <kbd className="rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-xs">
              Ctrl+U
            </kbd>{" "}
            (View Source), copy all, then{" "}
            <button
              type="button"
              className="text-fg underline-offset-2 hover:underline"
              onClick={onPaste}
            >
              paste the HTML here
            </button>
            . That bypasses Cloudflare completely.
          </p>
        )}
      </section>
    );
  }

  const verdictColor = result.is_drupal
    ? result.confidence === "high"
      ? "text-yes"
      : "text-mid"
    : "text-no";

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-wide text-muted">
              Verdict
            </p>
            <p className={`mt-1 text-2xl font-medium ${verdictColor}`}>
              {result.is_drupal ? "Drupal detected" : "Not clearly Drupal"}
            </p>
          </div>
          <ScoreRing score={result.score} />
        </div>
        <p className="mt-4 text-sm text-muted">
          {result.version_guess
            ? `Guessed version ${result.version_guess}`
            : "Version unknown"}
          {" · "}
          {result.confidence} confidence
          {" · "}
          HTTP {result.http_status}
        </p>
        {result.final_url && result.final_url !== result.url && (
          <p className="mt-1 break-all font-mono text-xs text-subtle">
            Redirected to {result.final_url}
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChipCard title="Content types" items={result.content_types_on_page} />
        <ChipCard title="Modules" items={result.modules_inferred} />
        <ChipCard title="Fields" items={result.fields_on_page} />
        <ChipCard title="Field types" items={result.field_types_on_page} />
        <ChipCard title="Views" items={result.views_on_page} />
        <ChipCard title="View displays" items={result.view_displays_on_page} />
        <ChipCard title="Themes" items={result.themes_inferred} />
        <ChipCard title="Regions" items={result.regions_on_page} />
        <ChipCard title="Blocks" items={result.blocks_on_page} />
        <ChipCard
          title="Panels"
          items={[...result.panels.layouts, ...result.panels.panes].slice(
            0,
            24,
          )}
        />
      </div>

      <FilesCard files={result.files} />

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-medium">Fingerprint hits</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="px-5 py-2 font-medium">Where</th>
                <th className="px-5 py-2 font-medium">Signal</th>
                <th className="px-5 py-2 font-medium">Pts</th>
              </tr>
            </thead>
            <tbody>
              {result.hits.map((hit, i) => (
                <tr key={`${hit.name}-${i}`} className="border-t border-border">
                  <td className="px-5 py-2 font-mono text-xs text-muted">
                    {hit.where}
                  </td>
                  <td className="px-5 py-2">
                    <span className="font-mono text-xs">{hit.name}</span>
                    {(hit.value || hit.match) && (
                      <span className="ml-2 text-subtle">
                        {hit.value || hit.match}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2 font-mono tabular-nums text-muted">
                    {hit.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="flex size-24 flex-col items-center justify-center rounded-full border border-border bg-elevated">
      <span className="font-mono text-2xl tabular-nums leading-none">
        {score}
      </span>
      <span className="mt-1 text-xs uppercase tracking-wide text-subtle">
        score
      </span>
    </div>
  );
}

function ChipCard({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="font-mono text-xs tabular-nums text-subtle">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-subtle">None on this page</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {items.slice(0, 18).map((item) => (
            <li
              key={item}
              className="rounded-sm bg-elevated px-2 py-1 font-mono text-xs text-fg"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function FilesCard({ files }: { files: DetectResult["files"] }) {
  const groups = [
    { label: "Images", items: files.images },
    { label: "PDFs", items: files.pdfs },
    { label: "Docs", items: files.docs },
    { label: "Image styles", items: files.image_styles },
    { label: "Private", items: files.private_system_files },
  ];
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-medium">Public files</h2>
      <p className="mt-1 text-sm text-muted">
        Paths under <span className="font-mono">/sites/*/files</span>
        {files.files_base_detected ? " found" : " not found on this page"}.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="text-xs uppercase tracking-wide text-subtle">
              {g.label}{" "}
              <span className="font-mono tabular-nums">({g.items.length})</span>
            </p>
            {g.items.length === 0 ? (
              <p className="mt-1 text-sm text-subtle">—</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {g.items.slice(0, 6).map((p) => (
                  <li
                    key={p}
                    className="truncate font-mono text-xs text-muted"
                    title={p}
                  >
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
