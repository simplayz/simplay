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
import { LEGACY_SAVE_KEY, prepareGameState, sanitizeGameState } from "../game/validate";
import {
  AUTOSAVE_MAX_WAIT_MS,
  AUTOSAVE_PROMPT_DELAY_MS,
  AutosaveController,
  type AutosaveStatus,
  type AutosaveWriteResult,
} from "../lib/autosave";
import {
  loadServerSave,
  putServerSave,
  resetServerSave,
  SaveApiError,
} from "../lib/saveApi";

const TICK_MS = 1000;
const SAVE_KEY = LEGACY_SAVE_KEY;

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

export type BootPhase = "loading" | "ready" | "error";

export interface LegacySaveInfo {
  status: "none" | "available" | "invalid";
  state?: GameState;
  error?: string;
}

export interface PersistenceState {
  boot: BootPhase;
  bootError?: string;
  status: AutosaveStatus;
  legacy: LegacySaveInfo;
  retryBoot: () => void;
  retrySave: () => void;
  reloadServer: () => Promise<void>;
  overwriteServer: () => void;
  migrateLegacy: () => void;
  discardLegacy: () => void;
}

interface Ctx {
  state: GameState;
  ui: UiState;
  dispatch: React.Dispatch<Action>;
  setUi: (patch: Partial<UiState> | ((u: UiState) => Partial<UiState>)) => void;
  toast: (text: string, tone?: "info" | "good" | "bad") => void;
  newGame: (name: string, company: string, lat: number, lng: number, by: "geolocation" | "manual") => void;
  loadDemo: () => void;
  hardReset: () => Promise<void>;
  importSave: (input: unknown) => { ok: true } | { ok: false; error: string };
  exportSave: () => string | null;
  persistence: PersistenceState;
}

const GameCtx = createContext<Ctx | null>(null);

function emptyGame(): GameState {
  return createGame("UNREGISTERED", "UNCLAIMED HOLDINGS", 0, 0, "manual");
}

function readLegacySave(): LegacySaveInfo {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LEGACY_SAVE_KEY);
  } catch {
    return {
      status: "invalid",
      error: "This browser blocked access to local storage, so no legacy save could be checked.",
    };
  }
  if (!raw) return { status: "none" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid", error: "The legacy browser save is not valid JSON. It has not been migrated." };
  }

  // Strip credential-shaped fields before the copy can be exported, uploaded,
  // or read by another tab. The gameplay data is kept until a server write
  // succeeds; only secrets are removed from storage now.
  const sanitized = sanitizeGameState(parsed);
  try {
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify(sanitized));
  } catch {
    // Best effort; the migration path still sanitizes before upload.
  }

  const prepared = prepareGameState(sanitized);
  if (!prepared.ok) {
    return {
      status: "invalid",
      error: `The legacy browser save did not pass validation: ${prepared.error}`,
    };
  }
  return { status: "available", state: prepared.state };
}

function bootErrorMessage(error: unknown): string {
  if (error instanceof SaveApiError) return error.message;
  return "The save service could not be reached. Your existing save has not been changed.";
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof SaveApiError) return error.message;
  return "The save service could not be reached. Your game is still in memory.";
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [bootNonce, setBootNonce] = useState(0);
  const [boot, setBoot] = useState<{ phase: BootPhase; error?: string }>({ phase: "loading" });
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>({ phase: "idle", revision: 0 });
  const [legacy, setLegacy] = useState<LegacySaveInfo>({ status: "none" });
  const [state, dispatch] = useReducer(reducer, undefined, emptyGame);
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

  const autosaveRef = useRef<AutosaveController<GameState> | null>(null);
  const cleanStateRef = useRef<GameState | null>(null);
  const promptNextSave = useRef(false);
  const legacyMarkedForRemoval = useRef(false);

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

  const handleSaveStatus = useCallback(
    (status: AutosaveStatus) => {
      setSaveStatus(status);
      if (status.phase !== "saved" || !legacyMarkedForRemoval.current) return;
      legacyMarkedForRemoval.current = false;
      try {
        window.localStorage.removeItem(LEGACY_SAVE_KEY);
      } catch {
        // The server copy is now authoritative; the stale local copy can be
        // cleared on a later successful save if storage is temporarily blocked.
      }
      setLegacy({ status: "none" });
      toast("Legacy browser save migrated. The local copy was removed after the server confirmed the write.", "good");
    },
    [toast],
  );

  const writeSnapshot = useCallback(
    async (snapshot: GameState, revision: number): Promise<AutosaveWriteResult> => {
      try {
        const result = await putServerSave(snapshot, revision);
        cleanStateRef.current = snapshot;
        return { ok: true, revision: result.revision, savedAt: result.savedAt };
      } catch (error) {
        if (error instanceof SaveApiError) {
          if (error.code === "REVISION_CONFLICT") {
            return {
              ok: false,
              kind: "conflict",
              currentRevision: error.currentRevision ?? revision + 1,
              currentUpdatedAt: error.currentUpdatedAt,
            };
          }
          return { ok: false, kind: "error", message: error.message };
        }
        return { ok: false, kind: "error", message: saveErrorMessage(error) };
      }
    },
    [],
  );

  const createController = useCallback(
    (initialRevision: number) =>
      new AutosaveController<GameState>({
        initialRevision,
        maxWaitMs: AUTOSAVE_MAX_WAIT_MS,
        promptDelayMs: AUTOSAVE_PROMPT_DELAY_MS,
        write: writeSnapshot,
        onChange: handleSaveStatus,
      }),
    [writeSnapshot, handleSaveStatus],
  );

  // ---- boot: load the anonymous server save before any ticks or writes -----
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    setBoot({ phase: "loading" });
    const legacyInfo = readLegacySave();
    console.log(
      "[simplayz:boot] legacy",
      LEGACY_SAVE_KEY,
      window.localStorage.length,
      window.localStorage.getItem(LEGACY_SAVE_KEY)?.length ?? null,
      legacyInfo.status,
      legacyInfo.error,
    );
    setLegacy(legacyInfo);

    void (async () => {
      try {
        const server = await loadServerSave(abort.signal);
        if (cancelled) return;

        if (server) {
          const prepared = prepareGameState(server.state);
          if (!prepared.ok) {
            setBoot({
              phase: "error",
              error: `The stored save did not pass validation (${prepared.error}). It has not been replaced.`,
            });
            return;
          }
          const controller = createController(server.revision);
          autosaveRef.current?.dispose();
          autosaveRef.current = controller;
          cleanStateRef.current = prepared.state;
          dispatch({ type: "hydrate", state: prepared.state });
          setUiRaw((u) => ({ ...u, booted: true, screen: "world", chat: [] }));
          controller.markSaved(server.revision, server.updatedAt);
        } else {
          const controller = createController(0);
          autosaveRef.current?.dispose();
          autosaveRef.current = controller;
          setSaveStatus(controller.getStatus());
        }
        setBoot({ phase: "ready" });
      } catch (error) {
        if (cancelled) return;
        setBoot({ phase: "error", error: bootErrorMessage(error) });
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      autosaveRef.current?.dispose();
      autosaveRef.current = null;
    };
  }, [bootNonce, createController, dispatch]);

  // ---- simulation clock ---------------------------------------------------
  useEffect(() => {
    if (boot.phase !== "ready" || !ui.booted || state.speed === 0) return;
    const id = window.setInterval(() => dispatch({ type: "tick" }), TICK_MS / state.speed);
    return () => window.clearInterval(id);
  }, [boot.phase, ui.booted, state.speed, dispatch]);

  // ---- autosave: coalesced, serialised, never before boot/onboarding ------
  useEffect(() => {
    if (boot.phase !== "ready" || !ui.booted) return;
    const controller = autosaveRef.current;
    if (!controller) return;
    if (state === cleanStateRef.current) {
      promptNextSave.current = false;
      return;
    }
    const prompt = promptNextSave.current;
    promptNextSave.current = false;
    controller.markDirty(state, prompt);
  }, [state, boot.phase, ui.booted]);

  // ---- best-effort save on page hide --------------------------------------
  useEffect(() => {
    const onPageHide = () => {
      const controller = autosaveRef.current;
      if (!controller) return;
      const status = controller.getStatus();
      if (status.phase === "conflict") return;
      const pending = controller.getPending();
      if (!pending) return;
      void putServerSave(pending, controller.getRevision(), { keepalive: true })
        .then((result) => controller.markSaved(result.revision))
        .catch(() => {
          // The normal error/retry path owns recovery while the page survives.
        });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  const dispatchWithPersistence = useCallback(
    (action: Action) => {
      if (action.type !== "tick") promptNextSave.current = true;
      dispatch(action);
    },
    [dispatch],
  );

  const newGame = useCallback(
    (name: string, company: string, lat: number, lng: number, by: "geolocation" | "manual") => {
      dispatchWithPersistence({ type: "register", ceoName: name, company, lat, lng, placedBy: by });
      setUiRaw((u) => ({ ...u, booted: true, screen: "world", chat: [] }));
    },
    [dispatchWithPersistence],
  );

  const loadDemo = useCallback(() => {
    // Pre-rolled city (GDD §7.2): 274 sim-hours of history so the loops are
    // visible on first contact instead of behind an empty map.
    dispatchWithPersistence({ type: "hydrate", state: demoGame() });
    setUiRaw((u) => ({ ...u, booted: true, screen: "world", chat: [] }));
  }, [dispatchWithPersistence]);

  const importSave = useCallback(
    (input: unknown): { ok: true } | { ok: false; error: string } => {
      const prepared = prepareGameState(input);
      if (!prepared.ok) return { ok: false, error: prepared.error };
      dispatchWithPersistence({ type: "hydrate", state: prepared.state });
      setUiRaw((u) => ({ ...u, booted: true, screen: "world", chat: [] }));
      return { ok: true };
    },
    [dispatchWithPersistence],
  );

  const exportSave = useCallback((): string | null => {
    const prepared = prepareGameState(state);
    if (!prepared.ok) return null;
    return JSON.stringify(prepared.state, null, 2);
  }, [state]);

  const retryBoot = useCallback(() => setBootNonce((n) => n + 1), []);

  const retrySave = useCallback(() => {
    autosaveRef.current?.retry();
  }, []);

  const reloadServer = useCallback(async () => {
    const controller = autosaveRef.current;
    controller?.setPaused(true);
    await controller?.whenIdle();
    try {
      const server = await loadServerSave();
      if (!server) {
        toast("No server save exists for this anonymous session.", "info");
        controller?.setPaused(false);
        return;
      }
      const prepared = prepareGameState(server.state);
      if (!prepared.ok) {
        toast(`The server save did not pass validation (${prepared.error}). Nothing was replaced.`, "bad");
        controller?.setPaused(false);
        return;
      }
      cleanStateRef.current = prepared.state;
      promptNextSave.current = false;
      dispatch({ type: "hydrate", state: prepared.state });
      setUiRaw((u) => ({ ...u, booted: true, chat: [] }));
      controller?.discardAndAcceptRevision(server.revision, server.updatedAt);
      controller?.setPaused(false);
      toast(`Loaded server revision ${server.revision}. This browser's unsaved changes were discarded.`, "good");
    } catch (error) {
      toast(`Could not load the server save — ${saveErrorMessage(error)}`, "bad");
      controller?.setPaused(false);
    }
  }, [dispatch, toast]);

  const overwriteServer = useCallback(() => {
    const controller = autosaveRef.current;
    const status = controller?.getStatus();
    if (!controller || status?.phase !== "conflict" || !status.conflict) return;
    controller.acceptServerRevision(status.conflict.currentRevision);
    toast(`Saving this browser's version over server revision ${status.conflict.currentRevision}.`, "info");
  }, [toast]);

  const migrateLegacy = useCallback(() => {
    if (legacy.status !== "available" || !legacy.state) return;
    legacyMarkedForRemoval.current = true;
    promptNextSave.current = true;
    cleanStateRef.current = null;
    dispatch({ type: "hydrate", state: { ...legacy.state } });
    setUiRaw((u) => ({ ...u, booted: true, screen: "world", chat: [] }));
  }, [legacy, dispatch]);

  const discardLegacy = useCallback(() => {
    try {
      window.localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch {
      // It is still safe to stop offering the invalid copy in this tab.
    }
    legacyMarkedForRemoval.current = false;
    setLegacy({ status: "none" });
  }, []);

  const hardReset = useCallback(async () => {
    const controller = autosaveRef.current;
    controller?.setPaused(true);
    await controller?.whenIdle();
    try {
      await resetServerSave();
    } catch (error) {
      controller?.setPaused(false);
      throw error;
    }

    try {
      window.localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch {
      // The server reset already succeeded; local storage may be blocked.
    }
    legacyMarkedForRemoval.current = false;
    promptNextSave.current = false;
    setLegacy({ status: "none" });
    controller?.dispose();

    const fresh = emptyGame();
    cleanStateRef.current = fresh;
    const nextController = createController(0);
    autosaveRef.current = nextController;
    setSaveStatus(nextController.getStatus());
    dispatch({ type: "hydrate", state: fresh });
    setUiRaw((u) => ({
      ...u,
      booted: false,
      screen: "world",
      selectedAreaId: null,
      selectedSiteId: null,
      studioTarget: null,
      visit: null,
      toast: null,
      chat: [],
    }));
  }, [createController, dispatch]);

  const persistence = useMemo<PersistenceState>(
    () => ({
      boot: boot.phase,
      bootError: boot.error,
      status: saveStatus,
      legacy,
      retryBoot,
      retrySave,
      reloadServer,
      overwriteServer,
      migrateLegacy,
      discardLegacy,
    }),
    [
      boot,
      saveStatus,
      legacy,
      retryBoot,
      retrySave,
      reloadServer,
      overwriteServer,
      migrateLegacy,
      discardLegacy,
    ],
  );

  const value = useMemo<Ctx>(
    () => ({
      state,
      ui,
      dispatch: dispatchWithPersistence,
      setUi,
      toast,
      newGame,
      loadDemo,
      hardReset,
      importSave,
      exportSave,
      persistence,
    }),
    [
      state,
      ui,
      dispatchWithPersistence,
      setUi,
      toast,
      newGame,
      loadDemo,
      hardReset,
      importSave,
      exportSave,
      persistence,
    ],
  );

  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}

export function useGame() {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame must be used inside GameProvider");
  return c;
}

export { SAVE_KEY, TICK_MS };
