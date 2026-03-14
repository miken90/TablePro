import "./styles/globals.css";
import { MainLayout } from "./components/layout/MainLayout";
import { ErrorBoundary } from "./components/shared/error-boundary";

export default function App() {
  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  );
}
