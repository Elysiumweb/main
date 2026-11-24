import { Component, Suspense, lazy, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const EmblemCanvas = lazy(() => import("../../three/EmblemCanvas"));

class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Fixed 3D backdrop shared by every public page.
 * The gold emblem glides to a new pose per route; a veil keeps text readable.
 * Bails out silently (plain obsidian gradient) without WebGL or on small screens
 * with reduced motion, and never blocks first paint.
 */
export function SceneBackground() {
  const { pathname } = useLocation();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Defer the WebGL init so it never competes with LCP.
    const id = window.setTimeout(() => setEnabled(hasWebGL()), 300);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 bg-background"
      data-testid="scene-background"
    >
      {enabled && (
        <SceneBoundary>
          <Suspense fallback={null}>
            <EmblemCanvas pathname={pathname} />
          </Suspense>
        </SceneBoundary>
      )}
      <div className="veil absolute inset-0" />
    </div>
  );
}

export default SceneBackground;
