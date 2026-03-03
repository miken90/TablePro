import { useAppStore } from "./stores/app";
import { WelcomeWindow } from "./pages/WelcomeWindow";
import { MainLayout } from "./pages/MainLayout";

function App() {
  const view = useAppStore((s) => s.view);

  if (view === "main") {
    return <MainLayout />;
  }

  return <WelcomeWindow />;
}

export default App;
