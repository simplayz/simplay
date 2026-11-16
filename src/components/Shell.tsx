import React from "react";
import { AREA_META, LEVELS } from "../game/constants";
import { SCREENS, flows } from "../game/engine";
import { formatLL } from "../game/geo";
import type { Screen } from "../game/types";
import type { AutosavePhase } from "../lib/autosave";
import { useGame } from "../state/store";
import { cn } from "../utils/cn";
import { Btn, Chip, Icon, Meter } from "./ui";

export const fmt = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const compact = (n: number) =>
  Math.abs(n) >= 1e6
    ? (n / 1e6).toFixed(2) + "M"
    : Math.abs(n) >= 1e4
      ? (n / 1e3).toFixed(1) + "k"
      : Math.round(n).toString();

/* --------------------------------- Top bar -------------------------------- */

function Readout({
  icon,
  label,
  value,
  sub,
  color,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex min-w-[104px] items-center gap-2 border border-transparent px-2 py-1 text-left transition-colors duration-200 hover:border-line hover:bg-ink-800/70",
        danger && "border-coral/45 bg-coral/8",
      )}
    >
      <span className="shrink-0 transition-transform duration-300 group-hover:scale-110" style={{ color }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="eyebrow block !text-[9px] leading-none">{label}</span>
        <span
          className={cn("num block text-[13px] font-semibold leading-tight", danger && "text-coral blink")}
          style={{ color: danger ? undefined : "#e9f2f3" }}
        >
          {value}
        </span>
        {sub && <span className="num block text-[9.5px] leading-tight text-dim">{sub}</span>}
      </span>
      {danger && <span className="absolute -right-px -top-px h-1.5 w-1.5 bg-coral blink" />}
    </button>
  );
}

export function TopBar() {
  const { state, dispatch, setUi } = useGame();
  const f = flows(state);
  const e = state.economy;
  const day = Math.floor(e.tick / 24) + 1;
  const hour = e.tick % 24;
  const need = LEVELS(e.level);

  return (
    <header className="relative z-20 flex h-[66px] shrink-0 items-stretch gap-2 border-b border-line bg-ink-900/92 px-3 backdrop-blur-sm">
      {/* brand */}
      <div className="flex w-[228px] shrink-0 flex-col justify-center border-r border-line pr-3">
        <div className="flex items-baseline gap-2">
          <span className="display text-[22px] leading-none text-chalk">
            SIM<span className="text-signal">PLAYZ</span>
          </span>
          <span className="num text-[9px] tracking-[0.18em] text-dim">v0.4</span>
        </div>
        <div className="eyebrow mt-1 !text-[8.5px] leading-none">
          {state.company} · CEO {state.ceoName}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Chip color="#f2a33c">LVL {e.level}</Chip>
          <div className="flex-1">
            <Meter value={e.xp} max={need} color="#f2a33c" height={3} />
          </div>
        </div>
      </div>

      {/* resources */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        <Readout
          icon={<Icon.coin size={19} />}
          label="Treasury"
          color="#f2a33c"
          value={`₡${compact(e.credits)}`}
          sub={`${f.netCredits >= 0 ? "+" : "−"}₡${compact(Math.abs(f.netCredits))}/h`}
          danger={e.credits < 20000}
        />
        <Readout
          icon={<Icon.bolt size={19} />}
          label="Grid"
          color={f.brownout ? "#ff6a55" : "#35d6c0"}
          value={`${compact(f.produced)}/${compact(f.demanded)}`}
          sub={f.brownout ? "BROWNOUT −50%" : `${compact(f.produced - f.demanded)} kW spare`}
          danger={f.brownout}
          onClick={() => setUi({ screen: "territory" })}
        />
        <Readout
          icon={<Icon.leaf size={19} />}
          label="Rations"
          color={f.food < f.foodDemand ? "#ff6a55" : "#a3cb4d"}
          value={compact(e.food)}
          sub={`${f.food - f.foodDemand >= 0 ? "+" : ""}${(f.food - f.foodDemand).toFixed(1)}/h · ${f.crew} crew`}
          danger={e.food <= 0 && f.crew > 0}
        />
        <Readout
          icon={<Icon.crate size={19} />}
          label="Materials"
          color="#ff8347"
          value={compact(e.materials)}
          sub={`+${f.materials.toFixed(1)}/h`}
        />
        <Readout
          icon={<Icon.grid size={19} />}
          label="Storage"
          color="#6fb7ff"
          value={`${compact(e.storageUsed)}/${compact(e.storageCap)}`}
          sub={e.storageUsed > e.storageCap ? "SPOILING 25%/h" : `${compact(e.storageCap - e.storageUsed)} free`}
          danger={e.storageUsed > e.storageCap}
        />
        <Readout
          icon={<Icon.walk size={19} />}
          label="Morale"
          color={e.morale < 40 ? "#ff6a55" : "#35d6c0"}
          value={`${e.morale.toFixed(0)}%`}
          sub={`rep ${e.reputation.toFixed(0)}`}
          danger={e.morale < 30}
        />
      </div>

      {/* clock + speed */}
      <div className="flex w-[236px] shrink-0 flex-col justify-center border-l border-line pl-3">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Sim clock</span>
          <span className="num text-[13px] font-semibold text-chalk">
            D{day} · {String(hour).padStart(2, "0")}:00
          </span>
        </div>
        {state.claim && (
          <div className="num mt-0.5 flex items-center gap-1 text-[9px] text-dim">
            <Icon.pin size={10} /> {formatLL(state.claim.center)} · {state.claim.sideKm}×{state.claim.sideKm} km
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1">
          {([0, 1, 4, 16] as const).map((sp) => (
            <button
              key={sp}
              onClick={() => dispatch({ type: "speed", speed: sp })}
              className={cn(
                "num border px-2 py-[2px] text-[10px] transition-all duration-200",
                state.speed === sp
                  ? "border-signal bg-signal text-ink-950 shadow-[0_0_14px_-4px_#f2a33c]"
                  : "border-line bg-ink-850 text-mist hover:border-ink-600 hover:text-chalk",
              )}
            >
              {sp === 0 ? "❚❚" : `${sp}×`}
            </button>
          ))}
          <span className="eyebrow ml-auto !text-[8.5px]">
            {state.speed === 0 ? "held" : `${state.speed} sim-h/s`}
          </span>
        </div>
      </div>
    </header>
  );
}

/* --------------------------------- Nav rail -------------------------------- */

export function NavRail() {
  const { state, ui, setUi } = useGame();
  const badges: Partial<Record<Screen, { n: number; c: string }>> = {
    territory: { n: state.projects.filter((p) => p.phase !== "operate").length, c: "#f2a33c" },
    studio: { n: state.buildings.length, c: "#35d6c0" },
    diplomacy: { n: state.remote.filter((r) => r.online).length, c: "#6fb7ff" },
    gdd: { n: state.questions.filter((q) => !q.answer).length, c: "#ff6a55" },
  };
  const iconFor: Record<Screen, (p: { size?: number }) => React.ReactElement> = {
    world: Icon.globe,
    territory: Icon.grid,
    studio: Icon.cube,
    boardroom: Icon.board,
    diplomacy: Icon.handshake,
    gdd: Icon.book,
  };

  return (
    <nav className="relative z-20 flex w-[86px] shrink-0 flex-col items-stretch gap-1 border-r border-line bg-ink-900/80 py-2">
      {SCREENS.map((s) => {
        const Ico = iconFor[s.id];
        const active = ui.screen === s.id;
        const badge = badges[s.id];
        return (
          <button
            key={s.id}
            onClick={() => setUi({ screen: s.id })}
            className={cn(
              "group relative flex flex-col items-center gap-1 px-1 py-2.5 transition-all duration-200",
              active ? "bg-ink-750" : "hover:bg-ink-850",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-0 h-full w-[2px] transition-all duration-300",
                active ? "bg-signal" : "bg-transparent group-hover:bg-ink-600",
              )}
            />
            <span className={cn("transition-transform duration-300", active ? "scale-110 text-signal" : "text-mist group-hover:text-chalk")}>
              <Ico size={20} />
            </span>
            <span className={cn("num text-[9px] uppercase tracking-[0.1em]", active ? "text-chalk" : "text-dim group-hover:text-mist")}>
              {s.label}
            </span>
            {badge && badge.n > 0 && (
              <span
                className="num absolute right-2 top-1.5 min-w-[15px] border px-[3px] text-[9px] leading-[14px]"
                style={{ color: badge.c, borderColor: `${badge.c}66`, background: `${badge.c}1a` }}
              >
                {badge.n}
              </span>
            )}
          </button>
        );
      })}
      <div className="mt-auto px-2 pb-1">
        <div className="eyebrow !text-[8px] leading-tight">Sectors</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {state.areas.map((a) => (
            <span
              key={a.id}
              className="h-2 w-2 border"
              style={{ background: AREA_META[a.kind].color, borderColor: "#0a1114" }}
              title={`${AREA_META[a.kind].label}: ${a.sites.filter((s) => s.buildingId).length}/5 built`}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}

/* -------------------------------- Ops ticker ------------------------------- */

const KIND_COLOR: Record<string, string> = {
  build: "#f2a33c",
  econ: "#a3cb4d",
  diplo: "#6fb7ff",
  exec: "#35d6c0",
  alert: "#ff6a55",
  visit: "#ff8347",
};

export function OpsTicker() {
  const { state, setUi } = useGame();
  const items = state.log.slice(0, 9);
  return (
    <footer className="relative z-20 flex h-[30px] shrink-0 items-center gap-3 border-t border-line bg-ink-900/92 px-3">
      <button
        onClick={() => setUi({ screen: "gdd" })}
        className="num shrink-0 border border-line bg-ink-850 px-2 py-[2px] text-[9px] uppercase tracking-[0.16em] text-mist transition-colors hover:border-signal hover:text-signal"
      >
        Ops log
      </button>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-6 whitespace-nowrap">
          {items.map((l, i) => (
            <span
              key={`${l.tick}-${i}`}
              className="num slide-in flex items-center gap-1.5 text-[10.5px] text-mist"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="text-dim">h{l.tick}</span>
              <span style={{ color: KIND_COLOR[l.kind] ?? "#9bb2b8" }}>▸</span>
              <span className="max-w-[640px] truncate">{l.text}</span>
            </span>
          ))}
        </div>
      </div>
      <span className="num shrink-0 text-[9.5px] text-dim">
        {state.netMode === "local-sim" ? "NET: LOCAL-SIM" : "NET: LIVE"} · {state.buildings.length} assets ·{" "}
        {state.projects.filter((p) => p.phase !== "operate").length} in flight
      </span>
      <SavePill />
    </footer>
  );
}

/* ------------------------------- boot gate -------------------------------- */

export function BootScreen() {
  const { persistence } = useGame();
  const failed = persistence.boot === "error";

  return (
    <div className="relative z-10 flex h-full min-h-screen w-full items-center justify-center p-6">
      <div className="panel w-full max-w-[560px] p-5">
        <div className="eyebrow">Simplayz · anonymous save service</div>
        <h1 className="display mt-1.5 text-[26px] leading-none text-chalk">
          {failed ? "SAVE SERVICE UNAVAILABLE" : "OPENING YOUR OPERATIONS CONSOLE"}
        </h1>
        {failed ? (
          <>
            <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
              {persistence.bootError ?? "The save service could not be reached."}
            </p>
            <p className="num mt-2 border-l-2 border-coral/60 pl-2 text-[10px] leading-snug text-dim">
              Nothing has been overwritten. Retry before starting or importing a save.
            </p>
            <div className="mt-4 flex gap-2">
              <Btn variant="primary" onClick={persistence.retryBoot}>
                <Icon.arrow size={13} /> Retry connection
              </Btn>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
              Loading the durable save attached to this browser&apos;s anonymous session.
            </p>
            <div className="mt-4 h-[3px] w-full overflow-hidden bg-ink-950">
              <div className="h-full w-1/3 bg-signal blink" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- save recovery ------------------------------ */

export function SaveBanner() {
  const { persistence } = useGame();
  const [confirm, setConfirm] = React.useState<"reload" | "overwrite" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const status = persistence.status;

  if (persistence.boot !== "ready") return null;
  if (status.phase !== "conflict" && status.phase !== "error") return null;

  const conflict = status.phase === "conflict" ? status.conflict : undefined;

  return (
    <div className="relative z-20 shrink-0 border-b border-coral/45 bg-coral/8 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num border border-coral/55 bg-ink-950/60 px-2 py-[2px] text-[9px] uppercase tracking-[0.16em] text-coral">
          {conflict ? "save conflict" : "unsaved"}
        </span>
        <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-mist">
          {conflict
            ? `A newer server revision (r${conflict.currentRevision}) exists. Autosave is paused; this browser's game is still in memory.`
            : `Save failed — ${status.error ?? "the service is unavailable"}. Your game is still in memory and will keep retrying.`}
        </span>
        {!conflict && (
          <button
            onClick={persistence.retrySave}
            className="num border border-line bg-ink-850 px-2 py-1 text-[10px] text-chalk transition-colors hover:border-signal hover:text-signal"
          >
            Retry save now
          </button>
        )}
        {conflict && confirm === null && (
          <>
            <button
              onClick={() => setConfirm("reload")}
              className="num border border-line bg-ink-850 px-2 py-1 text-[10px] text-mist transition-colors hover:border-sky2 hover:text-sky2"
            >
              Load server version
            </button>
            <button
              onClick={() => setConfirm("overwrite")}
              className="num border border-line bg-ink-850 px-2 py-1 text-[10px] text-mist transition-colors hover:border-signal hover:text-signal"
            >
              Keep this version
            </button>
          </>
        )}
        {conflict && confirm !== null && (
          <>
            <span className="num text-[10px] text-chalk">
              {confirm === "reload"
                ? `Discard this browser's unsaved changes and load server revision r${conflict.currentRevision}?`
                : `Replace server revision r${conflict.currentRevision} with this browser's game?`}
            </span>
            <button
              disabled={busy}
              onClick={async () => {
                if (confirm === "reload") {
                  setBusy(true);
                  try {
                    await persistence.reloadServer();
                  } finally {
                    setBusy(false);
                    setConfirm(null);
                  }
                } else {
                  persistence.overwriteServer();
                  setConfirm(null);
                }
              }}
              className="num border border-coral/60 bg-coral/15 px-2 py-1 text-[10px] text-coral transition-colors hover:bg-coral/25 disabled:opacity-50"
            >
              {busy ? "Working…" : "Confirm"}
            </button>
            <button
              disabled={busy}
              onClick={() => setConfirm(null)}
              className="num border border-line px-2 py-1 text-[10px] text-mist hover:text-chalk disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ save status ------------------------------- */

function SavePill() {
  const { persistence } = useGame();
  const s = persistence.status;
  const meta: Record<AutosavePhase, { text: string; color: string; blink?: boolean }> = {
    idle: { text: "SAVE READY", color: "#647c84" },
    dirty: { text: "UNSAVED", color: "#f2a33c" },
    saving: { text: "SAVING…", color: "#35d6c0", blink: true },
    saved: { text: `SAVED r${s.revision}`, color: "#35d6c0" },
    error: { text: "SAVE FAILED", color: "#ff6a55", blink: true },
    conflict: { text: "SAVE CONFLICT", color: "#ff6a55", blink: true },
  };
  const m = meta[s.phase];
  return (
    <span
      className={cn("num shrink-0 border px-1.5 py-[1px] text-[8.5px] uppercase tracking-[0.12em]", m.blink && "blink")}
      style={{ color: m.color, borderColor: `${m.color}55`, background: `${m.color}12` }}
      title={
        s.lastSavedAt
          ? `Last confirmed server write: ${new Date(s.lastSavedAt).toLocaleTimeString()}`
          : "No server write confirmed in this tab yet"
      }
    >
      {m.text}
    </span>
  );
}

export function Toast() {
  const { ui } = useGame();
  if (!ui.toast) return null;
  const c = ui.toast.tone === "bad" ? "#ff6a55" : ui.toast.tone === "good" ? "#35d6c0" : "#f2a33c";
  return (
    <div
      className="rise pointer-events-none fixed bottom-12 left-1/2 z-50 -translate-x-1/2 border bg-ink-900/96 px-4 py-2 text-[12px] shadow-[0_18px_50px_-20px_#000]"
      style={{ borderColor: `${c}80`, color: "#e9f2f3" }}
    >
      <span className="num mr-2" style={{ color: c }}>▸</span>
      {ui.toast.text}
    </div>
  );
}
