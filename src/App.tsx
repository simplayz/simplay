import { useEffect } from "react";
import Boardroom from "./components/Boardroom";
import Diplomacy from "./components/Diplomacy";
import GDD from "./components/GDD";
import Onboarding from "./components/Onboarding";
import { NavRail, OpsTicker, Toast, TopBar } from "./components/Shell";
import Studio from "./components/Studio";
import Territory from "./components/Territory";
import WorldMap from "./components/WorldMap";
import { TopoBackdrop } from "./components/ui";
import { SCREENS } from "./game/engine";
import { GameProvider, useGame } from "./state/store";

function Console() {
  const { ui, setUi } = useGame();

  // Keyboard: 1–6 jump screens (ignored while typing or while the mouse is locked)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (document.pointerLockElement) return;
      const i = Number(e.key);
      if (i >= 1 && i <= SCREENS.length) setUi({ screen: SCREENS[i - 1].id });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setUi]);

  if (!ui.booted)
    return (
      <div className="relative h-full w-full">
        <TopoBackdrop />
        <Onboarding />
      </div>
    );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <TopoBackdrop />
      <TopBar />
      <div className="relative z-10 flex min-h-0 flex-1">
        <NavRail />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div key={ui.screen} className="rise h-full min-h-0">
            {ui.screen === "world" && <WorldMap />}
            {ui.screen === "territory" && <Territory />}
            {ui.screen === "studio" && <Studio />}
            {ui.screen === "boardroom" && <Boardroom />}
            {ui.screen === "diplomacy" && <Diplomacy />}
            {ui.screen === "gdd" && <GDD />}
          </div>
        </main>
      </div>
      <OpsTicker />
      <Toast />
      <div className="pointer-events-none fixed bottom-9 right-3 z-[800] num text-[9px] text-dim/70">
        keys 1–6 switch console views
      </div>
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Console />
    </GameProvider>
  );
}
