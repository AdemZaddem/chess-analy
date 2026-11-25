import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GameResult, NormalizedGame, PlayerInfo } from "@/lib/chess/types";

const resultLabels: Record<GameResult, string> = {
  "1-0": "White won",
  "0-1": "Black won",
  "1/2-1/2": "Draw",
  "*": "Unfinished",
};

function PlayerRow({
  player,
  color,
  active,
}: {
  player: PlayerInfo;
  color: "White" | "Black";
  active: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-surface-2/60 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`size-3 shrink-0 rounded-full border ${
            color === "White"
              ? "border-ink/40 bg-ink"
              : "border-white/10 bg-[#101512]"
          } ${active ? "ring-2 ring-accent/60 ring-offset-2 ring-offset-surface" : ""}`}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {player.title ? (
              <span className="mr-1 text-xs text-accent">{player.title}</span>
            ) : null}
            {player.name}
          </p>
          <p className="text-xs text-muted">{color}</p>
        </div>
      </div>
      {player.rating !== undefined ? (
        <span className="font-mono text-sm text-ink">{player.rating}</span>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 truncate text-xs text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function GameMetadata({
  game,
  turn,
}: {
  game: NormalizedGame;
  turn: "w" | "b";
}) {
  const { metadata } = game;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3 py-4">
        <CardTitle>Game details</CardTitle>
        <Badge variant={metadata.result === "*" ? "neutral" : "success"}>
          {metadata.result} · {resultLabels[metadata.result]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {game.warnings.map((warning) => (
          <p
            key={warning}
            className="flex items-start gap-2 rounded-lg border border-violet/25 bg-violet/10 p-2.5 text-xs text-violet"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {warning}
          </p>
        ))}

        <div className="space-y-2">
          <PlayerRow
            player={metadata.white}
            color="White"
            active={turn === "w"}
          />
          <PlayerRow
            player={metadata.black}
            color="Black"
            active={turn === "b"}
          />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-soft pt-4">
          <Detail label="Time control" value={metadata.timeControl} />
          <Detail label="Opening" value={metadata.opening} />
          <Detail label="ECO" value={metadata.eco} />
          <Detail label="Event" value={metadata.event} />
          <Detail label="Date" value={metadata.date} />
          <Detail label="Round" value={metadata.round} />
          {metadata.site ? (
            <Detail label="Site" value={metadata.site} />
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
