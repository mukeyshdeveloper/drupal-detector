"use client";

import { useState } from "react";
import { Radar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DetectResult } from "@/lib/detect";

const SAMPLE = "https://portableapps.com/";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectResult | null>(null);

  async function runScan(target = url) {
    if (!target.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/scan", { 
        method: "POST", 
        body: JSON.stringify({ url: target }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({
        url: target,
        final_url: target,
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
        error: e instanceof Error ? e.message : "Scan failed",
      });
    } finally {
      setLoading(false);
    }
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
            Paste a live URL. We fetch the page and score Drupal fingerprints —
            generator tags, node types, fields, views, panels, and file paths.
          </p>
        </div>
      </header>

      <form
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-panel sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void runScan();
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
        <Button type="submit" disabled={loading || !url.trim()} className="w-full sm:w-auto">
          <Search className="size-4" />
          {loading ? "Scanning…" : "Scan"}
        </Button>
      </form>

      <p className="mt-3 text-xs text-subtle">
        Try{" "}
        <button
          type="button"
          className="font-mono text-fg underline-offset-2 hover:underline"
          onClick={() => {
            setUrl(SAMPLE);
            void runScan(SAMPLE);
          }}
        >
          portableapps.com
        </button>{" "}
        — a known Drupal 7 site.
      </p>

      {!result && !loading && <EmptyHints />}
      {loading && <LoadingPanel />}
      {result && !loading && <ResultPanel result={result} />}
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
        <article key={item.k} className="rounded-lg border border-border bg-surface p-4">
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

function ResultPanel({ result }: { result: DetectResult }) {
  if (result.error) {
    return (
      <section className="mt-8 rounded-xl border border-border bg-surface p-6">
        <p className="text-sm text-no">{result.error}</p>
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
          items={[...result.panels.layouts, ...result.panels.panes].slice(0, 24)}
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
      <span className="font-mono text-2xl tabular-nums leading-none">{score}</span>
      <span className="mt-1 text-xs uppercase tracking-wide text-subtle">score</span>
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
