import { AnalysisWorkspace } from "@/components/analysis-workspace";
import { Badge } from "@/components/ui/badge";
import {
  ChartNoAxesCombined,
  FileText,
  ShieldCheck,
} from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "Bring any standard PGN",
    description:
      "Upload a .pgn file or paste notation. Castling, promotions, en passant and custom starting positions are handled correctly.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Local engine analysis",
    description:
      "Analyze one position or the whole game with self-hosted Stockfish 19 Lite WASM in a Web Worker. Choose depth presets and review every move.",
  },
  {
    icon: ShieldCheck,
    title: "Private by default",
    description:
      "No account, no upload to a server, no tracking. Imports and engine analysis stay in your browser.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-14 pt-7 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
            <ChartNoAxesCombined className="size-5" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">
            MoveLens
          </span>
        </div>
        <Badge variant="success">Phase 4 · Full-game review</Badge>
      </header>

      <section className="mx-auto mt-14 max-w-3xl text-center sm:mt-20">
        <Badge variant="violet">Free · Local-first · No account needed</Badge>
        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
          Analyze your chess games,{" "}
          <span className="text-accent">move by move.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
          Import a PGN, replay every position with accurate navigation, then
          analyze one position or the whole game with a local Stockfish engine.
          A clean workspace for understanding the games you already played.
        </p>
      </section>

      <div className="mt-10" id="import">
        <AnalysisWorkspace />
      </div>

      <section
        className="mt-14 grid gap-4 sm:grid-cols-3"
        aria-label="Product highlights"
      >
        {features.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-2xl border border-line-soft bg-surface/50 p-5"
          >
            <Icon className="size-5 text-accent" aria-hidden />
            <h2 className="mt-4 text-sm font-semibold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {description}
            </p>
          </div>
        ))}
      </section>

      <footer className="mt-12 flex flex-col gap-2 border-t border-line-soft pt-6 text-xs text-muted/80 sm:flex-row sm:items-center sm:justify-between">
        <p>MoveLens · A free, local-first chess analysis workspace.</p>
        <p>Local single-position and full-game engine analysis.</p>
      </footer>
    </main>
  );
}
