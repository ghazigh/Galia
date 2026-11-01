import { Component, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { HouseView } from '../house/HouseView';
import type { FocusTarget } from '../house/model';
import { skyLook } from './sky';
import type { HouseSceneProps } from './HouseScene';
import type { SceneView } from './layout';

// The 3D scene (three.js + React Three Fiber) is a separate chunk; until it loads — or where WebGL
// isn't available — the stage shows the same sky as a gradient with the illustrated house.

const HouseScene = lazy(() => import('./HouseScene'));

let probe: { webgl: boolean; software: boolean } | null = null;

/** Checks once whether WebGL exists, and whether it is drawn in software (no GPU). */
function probeWebGL(): { webgl: boolean; software: boolean } {
  if (probe) return probe;
  probe = { webgl: false, software: false };
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      probe.webgl = true;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      probe.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
      // Screenshots taken in development (in software) can still ask for the full settings.
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('gpu')) probe.software = false;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    probe.webgl = false;
  }
  return probe;
}

export function supportsWebGL(): boolean {
  return probeWebGL().webgl;
}

/** Starts downloading the 3D chunk early (e.g. while the user signs in). */
export function preloadHouseScene() {
  if (supportsWebGL()) void import('./HouseScene');
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.warn('3D house unavailable, showing the illustrated one', error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function focusOf(view: SceneView): FocusTarget {
  switch (view.kind) {
    case 'level':
      return view.level;
    case 'roof':
      return 'roof';
    case 'yard':
      return 'yard';
    default:
      return 'overview';
  }
}

/** Gradient sky plus the illustrated house: the loading state and the no-WebGL fallback. */
export function StageFallback(props: HouseSceneProps & { illustrated?: boolean }) {
  const { daylight, className, view, summaries, selectedZone, highlightFixture, zoneLabel, onSelectZone, insetTop = 0 } = props;
  const look = useMemo(
    () => skyLook(daylight.sun.altitude, daylight.moon.altitude, daylight.illumination.fraction),
    [daylight.sun.altitude, daylight.moon.altitude, daylight.illumination.fraction],
  );
  return (
    <div className={className} style={{ background: `linear-gradient(to bottom, ${look.zenith} 0%, ${look.horizon} 58%, ${look.ground} 100%)` }}>
      {props.illustrated !== false && (
        <div className="absolute inset-x-0 bottom-0" style={{ top: insetTop }}>
          <HouseView
            className="h-full w-full"
            summaries={summaries}
            selectedZone={selectedZone}
            highlightFixture={highlightFixture}
            focus={focusOf(view)}
            dark={daylight.isNight}
            zoneLabel={zoneLabel}
            onSelectZone={onSelectZone}
          />
        </div>
      )}
    </div>
  );
}

export function HouseStage(props: HouseSceneProps) {
  if (!supportsWebGL()) return <StageFallback {...props} />;
  return (
    <SceneBoundary fallback={<StageFallback {...props} />}>
      <Suspense fallback={<StageFallback {...props} illustrated={false} />}>
        {/* Without a GPU every pixel is drawn on the CPU: keep to the lightest settings. */}
        <HouseScene {...props} quality={probeWebGL().software ? 'saver' : props.quality} />
      </Suspense>
    </SceneBoundary>
  );
}
