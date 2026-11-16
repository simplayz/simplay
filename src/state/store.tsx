'use client';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { createGame, demoGame, reducer } from "../game/engine";
import type { Action } from "../game/engine";
import { parseSave } from '../persistence/validation';
import { SaveQueue, type SaveStatus } from '../persistence/queue';
import { readRemote, writeRemote, exportSave, legacySave, redactLegacy, SAVE_KEY } from '../persistence/client';
import type { ChatMessage, GameState, Screen } from "../game/types";

const TICK_MS = 1000;

export interface UiState {
  screen: Screen;
  booted: boolean;
  selectedAreaId: string | null;
  selectedSiteId: string | null;
  studioTarget: { kind: "project" | "building"; id: string } | null;
  visit: { ownerName: string; buildingName: string; planId: string } | null;
  toast: { text: string; tone: "info" | "good" | "bad" } | null;
  chat: ChatMessage[];
  chatRole: "cto" | "cfo" | "coo" | "all";
}

interface Ctx {
  state: GameState;
  ui: UiState;
  dispatch: React.Dispatch<Action>;
  setUi: (patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)) => void;
  toast: (text: string, tone?: "info" | "good" | "bad") => void;
  newGame: (name: string, company: string, lat: number, lng: number, by: "geolocation" | "manual") => void;
  loadDemo: () => void;
  hardReset: () => void;
}

const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, () => createGame("UNREGISTERED", "UNCLAIMED HOLDINGS", 0, 0, "manual"));
  const queue = useRef<SaveQueue | null>(null);
  const urgent = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [legacy, setLegacy] = useState<GameState | null>(null);
  const [legacyError, setLegacyError] = useState('');
  const [legacyChosen, setLegacyChosen] = useState(false);
  const legacyPending = useRef(false);
  const dispatch = useCallback<React.Dispatch<Action>>((action) => {
    const safe = action.type === 'hydrate' ? { ...action, state: parseSave(action.state) } : action;
    if (action.type !== 'tick') urgent.current = true;
    rawDispatch(safe);
  }, []);
  const [ui, setUiRaw] = useState<UiState>({
    screen: "world",
    booted: false,
    selectedAreaId: null,
    selectedSiteId: null,
    studioTarget: null,
    visit: null,
    toast: null,
    chat: [],
    chatRole: "all",
  });

  const setUi = useCallback(
    (patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)) =>
      setUiRaw((u) => ({ ...u, ...(typeof patch === "function" ? patch(u) : patch) })),
    [],
  );

  const toastTimer = useRef<number | null>(null);
  const toast = useCallback(
    (text: string, tone: "info" | "good" | "bad" = "info") => {
      setUiRaw((u) => ({ ...u, toast: { text, tone } }));
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(
        () => setUiRaw((u) => ({ ...u, toast: null })),
        3600,
      );
    },
    [],
  );

  // Initial server state is resolved before mounting gameplay or starting its timer.
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
          try {
            const clean = legacySave(raw);
            localStorage.setItem(SAVE_KEY, JSON.stringify(clean));
            if (localStorage.getItem('simplayz.legacy.dismissed') !== '1') setLegacy(clean);
          } catch {
            try { localStorage.setItem(SAVE_KEY, redactLegacy(raw)); } catch { /* invalid non-JSON retained for manual recovery; never uploaded */ }
            setLegacyError('Legacy save is invalid. It was not uploaded or used. Recover from a valid export; legacy data is retained.');
          }
        }
      } catch { /* local storage disabled; server persistence still works */ }
    readRemote().then(remote => {
      if (!active) return;
      if (remote.state) rawDispatch({ type: 'hydrate', state: remote.state });
      setUiRaw(u => ({ ...u, booted: !!remote.state, screen: 'world', chat: [] }));
      queue.current = new SaveQueue(remote.revision, writeRemote, setStatus, () => {
        if (legacyPending.current) {
          try { localStorage.removeItem(SAVE_KEY); } catch { /* browser storage unavailable */ }
          legacyPending.current = false;
        }
      });
      setStatus('saved');
      setLoading(false);
    }).catch(() => { if (active) setLoadError('Unable to load server save. Retry to avoid overwriting existing progress.'); });
    return () => { active = false; queue.current?.dispose(); queue.current = null; };
  }, [loadAttempt]);

  useEffect(() => {
    if (loading || (legacy && !legacyChosen) || !ui.booted || state.speed === 0) return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), TICK_MS / state.speed);
    return () => window.clearInterval(id);
  }, [state.speed, ui.booted, loading, legacy, legacyChosen, dispatch]);

  const skipInitialSave = useRef(true);
  useEffect(() => {
    if (loading || !ui.booted || (legacy && !legacyChosen)) { skipInitialSave.current = true; return; }
    // Hydrated server state is already durable. User actions set urgent before render.
    if (skipInitialSave.current && !urgent.current) { skipInitialSave.current = false; return; }
    skipInitialSave.current = false;
    queue.current?.enqueue(state, urgent.current);
    urgent.current = false;
  }, [state, ui.booted, loading, legacy, legacyChosen]);

  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') void queue.current?.flush(); };
    const leave = () => { void queue.current?.flush(); };
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', leave); };
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const newGame = useCallback(
    (name: string, company: string, lat: number, lng: number, by: "geolocation" | "manual") => {
      dispatch({ type: "register", ceoName: name, company, lat, lng, placedBy: by });
      setUiRaw((u) => ({ ...u, booted: true, screen: "world", chat: [] }));
    },
    [],
  );

  const loadDemo = useCallback(() => {
    // Pre-rolled city (GDD §7.2): 274 sim-hours of history so the loops are
    // visible on first contact instead of behind an empty map.
    const g = demoGame();
    dispatch({ type: "hydrate", state: g });
    setUiRaw((u) => ({ ...u, booted: true, screen: "world", chat: [] }));
  }, []);

  const hardReset = useCallback(() => {
    if (!window.confirm('Reset this game and advisor preferences? This clears the server game after saving succeeds. Export first to keep progress.')) return;
    queue.current?.enqueue(null, true);
    setUiRaw(u => ({ ...u, booted: false, screen: 'world', chat: [] }));
    rawDispatch({ type: 'register', ceoName: 'UNREGISTERED', company: 'UNCLAIMED HOLDINGS', lat: 0, lng: 0, placedBy: 'manual' });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ state, ui, dispatch, setUi, toast, newGame, loadDemo, hardReset }),
    [state, ui, setUi, toast, newGame, loadDemo, hardReset],
  );

  const recovery = async (useCurrent: boolean) => {
    if (!window.confirm(useCurrent ? 'Export current progress first, then explicitly replace the latest server save with this in-memory game?' : 'Export current progress first. Load the server version and discard in-memory changes?')) return;
    try {
      const remote = await readRemote();
      queue.current?.dispose();
      queue.current = new SaveQueue(remote.revision, writeRemote, setStatus);
      setStatus('saved');
      if (useCurrent) queue.current.enqueue(ui.booted ? state : null, true);
      else {
        urgent.current = false; skipInitialSave.current = true;
        if (remote.state) rawDispatch({ type: 'hydrate', state: remote.state });
        setUiRaw(u => ({ ...u, booted: !!remote.state }));
      }
    } catch { toast('Recovery failed; current progress retained. Retry.', 'bad'); }
  };
  if (loading) return <div className="p-8 text-chalk" role="status">{loadError || 'Loading saved company…'}{loadError && <button className="field mt-4" onClick={() => setLoadAttempt(n=>n+1)}>Retry loading</button>}</div>;
  return <GameCtx.Provider value={value}>
    {legacy && !legacyChosen ? <div className="p-8 text-chalk">
      <h1>Legacy browser save found</h1>
      <p>The server may also have progress. Nothing has been replaced. API keys were removed from the legacy copy.</p>
      <button className="field mt-3" onClick={() => {
        legacyPending.current = true; setLegacyChosen(true);
        dispatch({ type: 'hydrate', state: legacy }); setUiRaw(u=>({...u, booted:true}));
      }}>Use legacy save (replace server after successful save)</button>
      <button className="field mt-3" onClick={() => { try { localStorage.setItem('simplayz.legacy.dismissed', '1'); } catch { /* optional preference */ } setLegacyChosen(true); setLegacy(null); }}>Keep server / start fresh (dismiss legacy offer)</button>
      <button className="field mt-3" onClick={() => exportSave(legacy)}>Export redacted legacy save</button>
    </div> : children}
    <div className="fixed bottom-0 left-0 z-[3000] flex w-full flex-wrap gap-3 bg-ink-950 px-3 py-1 text-xs text-chalk" aria-live="polite">
      <span>Server save: {status}{status==='error' ? ' — unsaved progress kept in memory' : ''}</span>
      <span>Anonymous session — clearing cookies loses access; export to keep a copy.</span>
      {legacyError && <span>{legacyError}</span>}
      {status==='error' && <button onClick={() => queue.current?.retry()}>Retry saving</button>}
      {(status==='conflict' || status==='error') && <>
        {ui.booted && <button onClick={() => exportSave(state)}>Export current progress</button>}
        <button onClick={() => void recovery(false)}>Load server version</button>
        <button onClick={() => void recovery(true)}>Replace server with current</button>
      </>}
    </div>
  </GameCtx.Provider>;
}

export function useGame() {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame must be used inside GameProvider");
  return c;
}

export { SAVE_KEY, TICK_MS };
