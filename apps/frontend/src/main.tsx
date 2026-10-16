import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { Link, createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { Button } from "@/components/ui/button";
import LandingPage from "@/pages/landing";
import "./index.css";

// The landing page loads alone; the app behind it arrives when it is opened.
const WelcomePage = lazy(() => import("@/pages/welcome"));
const WorkspacePage = lazy(() => import("@/pages/workspace"));
const ProjectLayout = lazy(() => import("@/pages/project-layout"));

// Each step loads on its own, so the 3D viewer only arrives with the steps
// that show it.
const steps = {
  capture: lazy(() => import("@/pages/steps/capture")),
  twin: lazy(() => import("@/pages/steps/twin")),
  scenario: lazy(() => import("@/pages/steps/scenario")),
  agents: lazy(() => import("@/pages/steps/agents")),
  run: lazy(() => import("@/pages/steps/run")),
  report: lazy(() => import("@/pages/steps/report")),
  redesign: lazy(() => import("@/pages/steps/redesign")),
};

function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center px-4 text-center">
      <div>
        <p className="font-mono text-7xl font-semibold">404</p>
        <p className="mt-2 text-muted-foreground">There is nothing at this address.</p>
        <Button asChild className="mt-6">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    </main>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/welcome", element: <WelcomePage /> },
  { path: "/workspace", element: <WorkspacePage /> },
  {
    path: "/p/:projectId",
    element: <ProjectLayout />,
    children: [
      { index: true, element: <steps.capture /> },
      ...Object.entries(steps).map(([path, Step]) => ({ path, element: <Step /> })),
    ],
  },
  { path: "*", element: <NotFound /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="ada-twin:theme" disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <Suspense>
          <RouterProvider router={router} />
        </Suspense>
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
