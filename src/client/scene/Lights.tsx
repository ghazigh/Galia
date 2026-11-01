import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type DirectionalLight, type HemisphereLight, type PointLight, type Vector3 } from 'three';
import type { SceneQuality } from '../lib/prefs';
import { partMaterial, setLightsOn, shellMaterials } from './materials';
import type { MaterialKey } from './parts';
import { SCONCES } from './parts';
import type { SkyLook } from './sky';

const TARGET = [2, 3, 0] as const;
const WARM = new Color('#ffb46b');
const MOONLIT = new Color('#2a3754');
/** Interior materials that pick up a warm glow when the lights are on. */
const GLOWING: MaterialKey[] = [
  'linen',
  'pillow',
  'sofa',
  'cushion',
  'wood',
  'woodDark',
  'woodLight',
  'cabinet',
  'counter',
  'appliance',
  'rug',
  'rugBlue',
  'porcelain',
  'sage',
  'terracotta',
  'lavender',
  'tank',
  'heatPump',
];

export function Lights({
  look,
  keyDir,
  quality,
  animate,
}: {
  look: SkyLook;
  /** Direction toward the key light (true sun, or the moon at night). */
  keyDir: Vector3;
  quality: SceneQuality;
  animate: boolean;
}) {
  const key = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const sconces = useRef<(PointLight | null)[]>([]);
  const shadowSize = quality === 'high' ? 2048 : 1024;

  useEffect(() => {
    const light = key.current;
    if (!light) return;
    light.position.set(TARGET[0] + keyDir.x * 45, TARGET[1] + Math.max(keyDir.y, 0.05) * 45, TARGET[2] + keyDir.z * 45);
    light.target.position.set(...TARGET);
    light.target.updateMatrixWorld();
    light.color.set(look.key.color);
    light.intensity = look.key.intensity;
    const cam = light.shadow.camera;
    cam.left = -19;
    cam.right = 19;
    cam.top = 19;
    cam.bottom = -19;
    cam.near = 5;
    cam.far = 95;
    cam.updateProjectionMatrix();
  }, [keyDir, look]);

  useEffect(() => {
    const h = hemi.current;
    if (!h) return;
    h.color.set(look.ambient.sky);
    h.groundColor.set(look.ambient.ground);
    h.intensity = look.ambient.intensity * 0.55;
  }, [look]);

  // Lights on at dusk: windows, lamps, porch lights and a warm cast over the rooms.
  const glowing = useMemo(() => GLOWING.map((name) => partMaterial(name)), []);
  useEffect(() => {
    const m = shellMaterials();
    for (const material of [...glowing, m.interior, ...Object.values(m.floors)]) {
      material.emissive.copy(WARM);
      material.emissiveIntensity = look.lightsOn * 0.075;
    }
    for (const light of sconces.current) if (light) light.intensity = look.lightsOn * 5;
  }, [glowing, look.lightsOn]);

  // A faint cool self-light keeps the dark siding and ground readable after dark.
  useEffect(() => {
    const m = shellMaterials();
    const fill: [typeof m.exterior, number][] = [
      [m.cladding.brickDark, 0.5],
      [m.cladding.brickLight, 0.34],
      [m.cladding.siding, 0.3],
      [m.cladding.foundation, 0.3],
      [m.roof, 0.42],
      [m.trim, 0.3],
      [m.soffit, 0.3],
      [m.garage, 0.4],
      [m.ground, 0.32],
      [m.terrain, 0.3],
      [m.drive, 0.28],
      [m.street, 0.28],
      [m.concrete, 0.24],
      [m.paver, 0.24],
      [m.stone, 0.24],
    ];
    for (const [material, strength] of fill) {
      material.emissive.copy(MOONLIT);
      material.emissiveIntensity = look.nightFill * strength;
    }
  }, [look.nightFill]);

  useFrame((state) => setLightsOn(look.lightsOn, animate ? state.clock.elapsedTime : 0));

  return (
    <>
      <directionalLight
        ref={key}
        castShadow={quality !== 'saver'}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />
      <hemisphereLight ref={hemi} />
      {quality !== 'saver' &&
        SCONCES.map(({ at: [x, y, z], normal: [nx, nz] }, i) => (
          <pointLight
            key={i}
            ref={(light) => {
              sconces.current[i] = light;
            }}
            position={[x + nx * 0.35, y - 0.2, z + nz * 0.35]}
            color="#ffc98a"
            intensity={0}
            distance={7}
            decay={2}
          />
        ))}
    </>
  );
}
