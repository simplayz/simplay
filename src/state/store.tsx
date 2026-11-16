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
import type { ChatMessage, GameState, Screen } from "../game/types";

const SAVE_KEY = "simplayz.save.v4";
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

function init(): { state: GameState; booted: boolean } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GameState;
      if (parsed && parsed.schema === 4 && parsed.claim) return { state: parsed, booted: true };
    }
  } catch {
    /* corrupt save — fall through to onboarding */
  }
  return { state: createGame("UNREGISTERED", "UNCLAIMED HOLDINGS", 0, 0, "manual"), booted: false };
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const boot = useRef(init());
  const [state, dispatch] = useReducer(reducer, boot.current.state);
  const [ui, setUiRaw] = useState<UiState>({
    screen: "world",
    booted: boot.current.booted,
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

  // ---- simulation clock -------------------------------------------------
  useEffect(() => {
    if (!ui.booted || state.speed === 0) return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), TICK_MS / state.speed);
    return () => window.clearInterval(id);
  }, [state.speed, ui.booted]);

  // ---- persistence ------------------------------------------------------
  useEffect(() => {
    if (!ui.booted) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      } catch {
        /* quota — the game continues in memory */
      }
    }, 700);
    return () => window.clearTimeout(id);
  }, [state, ui.booted]);

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
    localStorage.removeItem(SAVE_KEY);
    setUiRaw((u) => ({ ...u, booted: false, screen: "world", chat: [] }));
    dispatch({ type: "register", ceoName: "UNREGISTERED", company: "UNCLAIMED HOLDINGS", lat: 0, lng: 0, placedBy: "manual" });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ state, ui, dispatch, setUi, toast, newGame, loadDemo, hardReset }),
    [state, ui, setUi, toast, newGame, loadDemo, hardReset],
  );

  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}

export function useGame() {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame must be used inside GameProvider");
  return c;
}

export { SAVE_KEY, TICK_MS };
