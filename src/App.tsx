import { FractalSelector } from "./components/FractalSelector/FractalSelector";
import { FractalViewport } from "./components/FractalViewport/FractalViewport";
import { ParameterPanel } from "./components/ParameterPanel/ParameterPanel";
import { AudioSection } from "./components/ParameterPanel/AudioSection";
import { Timeline } from "./components/Timeline/Timeline";
import { TopBar } from "./components/RenderPanel/TopBar";
import { StatusBar } from "./components/RenderPanel/StatusBar";
import { PresetBrowser } from "./components/PresetBrowser/PresetBrowser";
import { RenderProgressOverlay } from "./components/RenderPanel/RenderProgressOverlay";
import { AudioPlayback } from "./components/AudioPlayback/AudioPlayback";
import "./App.css";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <TopBar />
      </header>

      <div className="app-body">
        <aside className="app-sidebar-left">
          <FractalSelector />
          <AudioSection />
        </aside>

        <main className="app-viewport">
          <FractalViewport />
        </main>

        <aside className="app-sidebar-right">
          <ParameterPanel />
        </aside>
      </div>

      <section className="app-timeline">
        <Timeline />
      </section>

      <footer className="app-statusbar">
        <StatusBar />
      </footer>

      <PresetBrowser />
      <RenderProgressOverlay />
      <AudioPlayback />
    </div>
  );
}
