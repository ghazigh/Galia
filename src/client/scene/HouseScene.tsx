import type { ZoneSummary } from '@shared/status';
import type { FixtureId, ZoneId } from '@shared/types';
import { LEVELS as LEVEL_DEFS, fixtureDef } from '@shared/zones';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Fog, PCFShadowMap, Vector3 } from 'three';
import type { Daylight } from '../lib/daylight';
import type { SceneQuality } from '../lib/prefs';
import { CameraRig, type RigHandle } from './CameraRig';
import { pulseStatus, RoofLayer, Storey, type LayerOffsets } from './House';
import { LabelProjector, SceneLabels, type LabelRegistry, type LabelSpec, type LabelTone, type MarkerSpec } from './Labels';
import {
  FIXTURE_ANCHORS,
  framingFor,
  LEVELS,
  levelZones,
  zone3d,
  zoneAnchor,
  type SceneView,
} from './layout';
import { Lights } from './Lights';
import { Site } from './Site';
import { Sky, SkyEnvironment } from './Sky';
import { defaultFacing, displayAltitude, skyDirection, skyLook } from './sky';

const DEG = Math.PI / 180;

export interface FixtureTask {
  taskId: string;
  title: string;
  due: string;
  tone: LabelTone;
}

export interface HouseSceneProps {
  summaries: Partial<Record<ZoneId, ZoneSummary>>;
  /** Most urgent open task per fixture, for the labels inside a room. */
  fixtureTasks?: Partial<Record<FixtureId, FixtureTask>>;
  view: SceneView;
  selectedZone: ZoneId | null;
  highlightFixture: FixtureId | null;
  zoneLabel: (zone: ZoneId) => string;
  daylight: Daylight;
  /** Compass bearing (degrees) the front of the house faces; null picks one for the hemisphere. */
  facing: number | null;
  quality: SceneQuality;
  showLabels: boolean;
  autoRotate: boolean;
  /** Pauses rendering (the page is covered or hidden). */
  active: boolean;
  reducedMotion: boolean;
  interactive?: boolean;
  /** Pixels at the bottom covered by UI; the house centers in the space above. */
  insetBottom?: MutableRefObject<number>;
  /** Pixels at the top reserved for the header (labels stay below it). */
  insetTop?: number;
  resetKey?: number;
  onSelectZone?: (zone: ZoneId | null) => void;
  onViewChange?: (view: SceneView) => void;
  onFixtureTap?: (fixture: FixtureId) => void;
  onUserMove?: (moved: boolean) => void;
  className?: string;
}

function toneOf(summary: Pick<ZoneSummary, 'overdue' | 'today' | 'soon' | 'open'> | undefined): LabelTone {
  if (!summary) return 'muted';
  if (summary.overdue) return 'overdue';
  if (summary.today) return 'today';
  if (summary.soon) return 'soon';
  return summary.open ? 'ok' : 'muted';
}

function valueOf(summary: Pick<ZoneSummary, 'overdue' | 'today' | 'soon' | 'open'> | undefined): string {
  if (!summary || summary.open === 0) return 'Nothing due';
  if (summary.overdue) return `${summary.overdue} overdue`;
  if (summary.today) return `${summary.today} due today`;
  if (summary.soon) return `${summary.soon} this week`;
  return 'All good';
}

function describe(label: string, summary: ZoneSummary | undefined): string {
  if (!summary || summary.open === 0) return `${label}: nothing scheduled`;
  const parts = [`${summary.open} open`];
  if (summary.overdue) parts.push(`${summary.overdue} overdue`);
  if (summary.today) parts.push(`${summary.today} due today`);
  if (summary.soon) parts.push(`${summary.soon} due soon`);
  return `${label}: ${parts.join(', ')}`;
}

const RANK: Record<LabelTone, number> = { overdue: 5, today: 4, soon: 3, accent: 3, ok: 1, muted: 0 };

function shortFixture(id: FixtureId): string {
  return fixtureDef(id).name.replace(/\s*\(.*\)$/, '');
}

function useVector(values: readonly [number, number, number]): Vector3 {
  const [x, y, z] = values;
  return useMemo(() => new Vector3(x, y, z), [x, y, z]);
}

/** Copies the sky look into renderer-wide settings: exposure and fog. */
function Atmosphere({ horizon, exposure }: { horizon: string; exposure: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  useEffect(() => {
    // The ground disc (170 m) dissolves into the horizon haze before its edge.
    if (!scene.fog) scene.fog = new Fog(horizon, 45, 165);
    else (scene.fog as Fog).color.set(horizon);
  }, [scene, horizon]);
  return null;
}

function StatusPulse({ animate }: { animate: boolean }) {
  useFrame((state) => pulseStatus(state.clock.elapsedTime, animate));
  return null;
}

/** Lowers the pixel ratio on devices that can't keep up, and raises it again when they can. */
function AdaptiveResolution({ max }: { max: number }) {
  const setDpr = useThree((state) => state.setDpr);
  const sample = useRef({ frames: 0, time: 0, dpr: max });
  useFrame((_, delta) => {
    const s = sample.current;
    s.frames += 1;
    s.time += Math.min(delta, 0.5);
    if (s.time < 1.5) return;
    const average = s.time / s.frames;
    s.frames = 0;
    s.time = 0;
    const next = average > 1 / 28 ? Math.max(1, s.dpr - 0.25) : average < 1 / 55 ? Math.min(max, s.dpr + 0.25) : s.dpr;
    if (next !== s.dpr) {
      s.dpr = next;
      setDpr(next);
    }
  });
  return null;
}

export default function HouseScene({
  summaries,
  fixtureTasks = {},
  view,
  selectedZone,
  highlightFixture,
  zoneLabel,
  daylight,
  facing,
  quality,
  showLabels,
  autoRotate,
  active,
  reducedMotion,
  interactive = true,
  insetBottom,
  insetTop = 0,
  resetKey = 0,
  onSelectZone,
  onViewChange,
  onFixtureTap,
  onUserMove,
  className,
}: HouseSceneProps) {
  const fallbackInset = useRef(0);
  const inset = insetBottom ?? fallbackInset;
  // `site` is the lot's height scale (it settles flat for the basement view).
  const offsets = useRef<LayerOffsets>({ basement: 0, ground: 0, upper: 0, roof: 0, site: 1 });
  const registry = useRef<LabelRegistry>({ labels: new Map(), markers: new Map() });
  const rig = useRef<RigHandle>({ controls: null, reset: () => undefined });
  const animate = !reducedMotion;

  // ── Sky ───────────────────────────────────────────────────────────────────────────────────
  const facingRad = facing !== null ? facing * DEG : defaultFacing(daylight.location.lat);
  const { sun, moon, illumination } = daylight;
  const look = useMemo(() => skyLook(sun.altitude, moon.altitude, illumination.fraction), [sun.altitude, moon.altitude, illumination.fraction]);
  const sunTrue = useVector(skyDirection(sun.azimuth, sun.altitude, facingRad));
  const sunShown = useVector(skyDirection(sun.azimuth, displayAltitude(sun.altitude), facingRad));
  const moonTrue = useVector(skyDirection(moon.azimuth, moon.altitude, facingRad));
  const moonShown = useVector(skyDirection(moon.azimuth, displayAltitude(moon.altitude), facingRad));
  const keyDir = look.key.source === 'sun' ? sunTrue : moonTrue;
  // Cloud cover changes from day to day (deterministic, so both phones agree).
  const day = Math.floor(daylight.at.valueOf() / 86_400_000);
  const cloudCover = 0.3 + 0.16 * Math.sin(day * 1.7) * Math.cos(day * 0.37);

  // ── Interaction ───────────────────────────────────────────────────────────────────────────
  const onRoomTap = useCallback(
    (zone: ZoneId, level: (typeof LEVELS)[number]) => {
      if (view.kind === 'exterior' || view.kind === 'roof' || view.kind === 'yard') {
        onViewChange?.({ kind: 'level', level });
        return;
      }
      if (view.kind === 'level' && view.level !== level) {
        onViewChange?.({ kind: 'level', level });
        return;
      }
      onSelectZone?.(zone === selectedZone ? null : zone);
    },
    [onSelectZone, onViewChange, selectedZone, view],
  );

  // ── Labels ────────────────────────────────────────────────────────────────────────────────
  const labels = useMemo<LabelSpec[]>(() => {
    if (!showLabels) return [];
    const out: LabelSpec[] = [];
    const zoneLabelSpec = (zone: ZoneId, emphasis = false): LabelSpec | null => {
      const anchor = zoneAnchor(zone);
      if (!anchor) return null;
      const summary = summaries[zone];
      const tone = emphasis ? 'accent' : toneOf(summary);
      const name = zoneLabel(zone);
      return {
        id: `zone-${zone}`,
        anchor: { type: 'point', ...anchor },
        title: name,
        value: emphasis && summary ? (summary.open ? `${summary.open} open` : 'Nothing due') : valueOf(summary),
        tone: emphasis ? (toneOf(summary) === 'muted' ? 'accent' : toneOf(summary)) : tone,
        fire: summary?.fireOverdue,
        ariaLabel: describe(name, summary),
        onClick: () => onSelectZone?.(zone === selectedZone ? null : zone),
        priority: (emphasis ? 10 : 0) + RANK[tone],
        emphasis,
      };
    };

    if (view.kind === 'exterior') {
      const outside: LabelSpec[] = [];
      // Zig-zag left and right up the facade, like the labels around a car in the Tesla app. The
      // basement only shows above ground at the garage, so its label points at the garage door.
      const facadeU: Record<'upper' | 'ground', number> = { upper: -1.6, ground: 2.6 };
      const garage = FIXTURE_ANCHORS['garage-door'][0];
      for (const level of LEVELS) {
        const zones = levelZones(level).map((zone) => summaries[zone]).filter((s): s is ZoneSummary => Boolean(s));
        const total = zones.reduce(
          (acc, s) => ({ overdue: acc.overdue + s.overdue, today: acc.today + s.today, soon: acc.soon + s.soon, open: acc.open + s.open }),
          { overdue: 0, today: 0, soon: 0, open: 0 },
        );
        const tone = toneOf(total);
        const name = LEVEL_DEFS.find((l) => l.id === level)?.name ?? level;
        outside.push({
          id: `level-${level}`,
          anchor:
            level === 'basement'
              ? { type: 'point', layer: garage.layer, point: [garage.point[0], 1.6, garage.point[2]], normal: garage.normal }
              : { type: 'facade', layer: level, y: 1.45, u: facadeU[level] },
          title: name,
          value: valueOf(total),
          tone,
          fire: zones.some((s) => s.fireOverdue),
          ariaLabel: `${name}: ${valueOf(total).toLowerCase()}. Show inside`,
          onClick: () => onViewChange?.({ kind: 'level', level }),
          priority: RANK[tone] + 1,
        });
      }
      for (const zone of ['roof', 'backyard'] as ZoneId[]) {
        const spec = zoneLabelSpec(zone);
        if (spec) outside.push(spec);
      }
      const house = summaries.house;
      if (house && (house.overdue || house.today || house.soon)) {
        const spec = zoneLabelSpec('house');
        if (spec) outside.push({ ...spec, priority: spec.priority - 0.5 });
      }
      // Only what needs attention; a calm house shows its all-clear labels instead.
      const due = outside.filter((label) => label.tone === 'overdue' || label.tone === 'today' || label.tone === 'soon');
      out.push(...(due.length ? due : outside));
    } else if (view.kind === 'exploded') {
      for (const zone of LEVELS.flatMap((level) => levelZones(level))) {
        const summary = summaries[zone];
        if (summary && (summary.overdue || summary.today || summary.soon)) {
          const spec = zoneLabelSpec(zone, zone === selectedZone);
          if (spec) out.push(spec);
        }
      }
      for (const zone of ['roof', 'backyard'] as ZoneId[]) {
        const summary = summaries[zone];
        if (summary && (summary.overdue || summary.today || summary.soon)) {
          const spec = zoneLabelSpec(zone);
          if (spec) out.push(spec);
        }
      }
    } else if (view.kind === 'level') {
      // Inside a floor the room labels are the way in, so every one of them gets placed.
      for (const zone of levelZones(view.level)) {
        if (selectedZone && zone !== selectedZone) continue;
        const spec = zoneLabelSpec(zone, zone === selectedZone);
        if (spec) out.push({ ...spec, priority: spec.priority + 3 });
      }
    } else {
      const spec = zoneLabelSpec(view.kind === 'roof' ? 'roof' : 'backyard', selectedZone !== null);
      if (spec) out.push(spec);
    }

    // Fixtures with open tasks in the selected room (or on the roof and in the yard).
    const fixtureZone = selectedZone ?? (view.kind === 'roof' ? 'roof' : view.kind === 'yard' ? 'backyard' : null);
    if (fixtureZone) {
      for (const [id, task] of Object.entries(fixtureTasks) as [FixtureId, FixtureTask][]) {
        if (fixtureDef(id).zoneId !== fixtureZone || id === highlightFixture) continue;
        const anchor = FIXTURE_ANCHORS[id][0];
        out.push({
          id: `fixture-${id}`,
          anchor: { type: 'point', ...anchor },
          title: shortFixture(id),
          value: task.due,
          tone: task.tone,
          ariaLabel: `${shortFixture(id)}: ${task.title}, ${task.due}`,
          onClick: () => onFixtureTap?.(id),
          priority: RANK[task.tone] - 0.5,
        });
      }
    }
    return out;
  }, [showLabels, view, summaries, zoneLabel, selectedZone, fixtureTasks, highlightFixture, onSelectZone, onViewChange, onFixtureTap]);

  const markers = useMemo<MarkerSpec[]>(() => {
    if (!highlightFixture) return [];
    return FIXTURE_ANCHORS[highlightFixture].map((anchor, i) => ({
      id: `${highlightFixture}-${i}`,
      anchor: { type: 'point', ...anchor },
      label: shortFixture(highlightFixture),
    }));
  }, [highlightFixture]);

  // ── Camera ────────────────────────────────────────────────────────────────────────────────
  const framing = useMemo(() => {
    const base = framingFor(view, selectedZone);
    const room = selectedZone ? zone3d(selectedZone) : null;
    const anchor = highlightFixture ? FIXTURE_ANCHORS[highlightFixture].find((a) => room && a.layer === room.level) : null;
    if (!anchor) return base;
    // Lean the framing toward the fixture the selected task is about, keeping the room in view.
    const [ax, , az] = anchor.point;
    const cx = (base.min[0] + base.max[0]) / 2;
    const cz = (base.min[2] + base.max[2]) / 2;
    const dx = (ax - cx) * 0.3;
    const dz = (az - cz) * 0.3;
    return { ...base, min: [base.min[0] + dx, base.min[1], base.min[2] + dz] as const, max: [base.max[0] + dx, base.max[1], base.max[2] + dz] as const };
  }, [view, selectedZone, highlightFixture]);
  const flyKey = `${view.kind}:${view.kind === 'level' ? view.level : ''}:${selectedZone ?? ''}:${highlightFixture ?? ''}:${resetKey}`;

  const ariaSummary = useMemo(() => {
    const issues = Object.values(summaries)
      .filter((s): s is ZoneSummary => Boolean(s && (s.overdue || s.today)))
      .map((s) => describe(zoneLabel(s.zoneId), s));
    return issues.length ? issues.join('. ') : 'Nothing overdue or due today.';
  }, [summaries, zoneLabel]);

  const dpr: [number, number] = quality === 'high' ? [1, 2] : quality === 'balanced' ? [1, 1.75] : [1, 1];

  return (
    <div className={className} style={{ touchAction: interactive ? 'none' : undefined }}>
      <Canvas
        className="!absolute inset-0"
        shadows={quality !== 'saver' ? { type: PCFShadowMap } : false}
        dpr={dpr}
        gl={{ antialias: quality !== 'saver', powerPreference: 'high-performance' }}
        camera={{ fov: 50, near: 0.3, far: 1600, position: [8, 7, 40] }}
        frameloop={active ? 'always' : 'never'}
        onPointerMissed={(event) => {
          if (event.type === 'click' && selectedZone) onSelectZone?.(null);
        }}
        onDoubleClick={() => rig.current.reset()}
        aria-label={`3D view of your house. ${ariaSummary}`}
        role="img"
      >
        <Atmosphere horizon={look.horizon} exposure={look.exposure} />
        <Sky look={look} sunDir={sunShown} moonDir={moonShown} sunTrueDir={sunTrue} cloudCover={cloudCover} animate={animate} />
        <SkyEnvironment look={look} sunDir={sunShown} moonDir={moonShown} />
        <Lights look={look} keyDir={keyDir} quality={quality} animate={animate} />
        <StatusPulse animate={animate} />
        <AdaptiveResolution max={dpr[1]} />
        {LEVELS.map((level) => (
          <Storey
            key={level}
            level={level}
            view={view}
            summaries={summaries}
            selectedZone={selectedZone}
            highlight={highlightFixture}
            offsets={offsets}
            animate={animate}
            onRoomTap={onRoomTap}
          />
        ))}
        <RoofLayer
          view={view}
          highlight={highlightFixture}
          selected={selectedZone === 'roof'}
          health={summaries.roof?.health}
          offsets={offsets}
          animate={animate}
          onTap={() => (view.kind === 'level' || view.kind === 'exploded' ? undefined : onSelectZone?.('roof'))}
        />
        <Site
          view={view}
          highlight={highlightFixture}
          backyardHealth={summaries.backyard?.health}
          backyardSelected={selectedZone === 'backyard'}
          offsets={offsets}
          animate={animate}
          onYardTap={() => onSelectZone?.('backyard')}
        />
        <CameraRig
          framing={framing}
          flyKey={flyKey}
          insetBottom={inset}
          insetTop={insetTop * 0.62}
          interactive={interactive}
          autoRotate={autoRotate && view.kind === 'exterior'}
          smooth={animate}
          handle={rig}
          onUserMove={onUserMove ?? (() => undefined)}
        />
        <LabelProjector labels={labels} markers={markers} registry={registry} offsets={offsets} insetBottom={inset} insetTop={insetTop} />
      </Canvas>
      <SceneLabels labels={labels} markers={markers} registry={registry} />
    </div>
  );
}

export type { SceneView };
export { EXTERIOR, sameView, viewForZone } from './layout';
