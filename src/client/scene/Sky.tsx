import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BackSide,
  Color,
  Mesh,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type WebGLRenderTarget,
} from 'three';
import type { SkyLook } from './sky';

// ── Shaders ──────────────────────────────────────────────────────────────────────────────────

const domeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const common = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uGlow;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonDir;
  uniform float uHorizonWarm;
  uniform float uSunDisc;
  uniform float uSunHalo;
  uniform float uMoonGlow;
  uniform float uIntensity;

  vec3 skyGradient(vec3 dir) {
    float h = dir.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.38));
    // Sunrise and sunset burn along the horizon on the sun's side.
    vec3 flatDir = normalize(vec3(dir.x, 0.0, dir.z) + 1e-5);
    vec3 flatSun = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5);
    float toward = max(dot(flatDir, flatSun), 0.0);
    float band = exp(-max(h, 0.0) * 7.0);
    col = mix(col, uGlow, uHorizonWarm * band * (0.25 + 0.75 * pow(toward, 3.0)));
    // Sun halo and moon glow.
    float sd = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 10.0) * 0.26 + pow(sd, 220.0) * 0.55 + pow(sd, 2400.0) * 1.2) * uSunHalo;
    float md = max(dot(dir, uMoonDir), 0.0);
    col += vec3(0.62, 0.7, 0.9) * (pow(md, 70.0) * 0.5 + pow(md, 12.0) * 0.06) * uMoonGlow;
    // Below the horizon the sky meets the fogged ground plane, which ends in the horizon haze.
    col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.02, h));
    return col * uIntensity;
  }
`;

const domeFragment = /* glsl */ `
  ${common}
  uniform float uTime;
  uniform float uStars;
  uniform float uCover;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  varying vec3 vDir;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.02 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
  vec3 starField(vec3 dir) {
    vec3 p = dir * 95.0;
    vec3 cell = floor(p);
    float h = hash13(cell);
    if (h < 0.955) return vec3(0.0);
    vec3 offset = vec3(hash13(cell + 1.7), hash13(cell + 4.3), hash13(cell + 9.1)) - 0.5;
    float d = length(fract(p) - 0.5 - offset * 0.6);
    float size = mix(0.05, 0.13, hash13(cell + 2.9));
    float twinkle = 0.65 + 0.35 * sin(uTime * (0.8 + h * 2.5) + h * 61.0);
    vec3 tint = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.88, 0.74), hash13(cell + 5.5));
    return tint * smoothstep(size, 0.0, d) * twinkle * (0.4 + (h - 0.955) * 20.0);
  }

  void main() {
    vec3 dir = normalize(vDir);
    vec3 col = skyGradient(dir);
    float sd = max(dot(dir, uSunDir), 0.0);
    // Sun disc with a soft rim.
    col += uSunColor * smoothstep(0.99984, 0.99993, sd) * 16.0 * uSunDisc;

    if (dir.y > 0.0) {
      float horizonFade = smoothstep(0.0, 0.1, dir.y);
      col += starField(dir) * uStars * horizonFade;
      // Clouds on a plane above the house, drifting slowly.
      vec2 uv = dir.xz / (dir.y + 0.1) * 0.32 + vec2(uTime * 0.0035, uTime * 0.0012);
      float n = fbm(uv);
      float detail = fbm(uv * 2.3 + 4.1);
      // Normalize the noise (mean ~0.52, spread ~0.09) so uCover reads as the share of sky covered.
      float z = (n * 0.78 + detail * 0.3 - 0.52) / 0.09;
      float threshold = (0.5 - uCover) * 2.6;
      float density = smoothstep(threshold - 0.2, threshold + 1.4, z) * smoothstep(0.0, 0.14, dir.y);
      float lit = clamp(0.45 + 0.55 * pow(sd, 3.0) - detail * 0.35, 0.0, 1.0);
      vec3 cloud = mix(uCloudShade, uCloudLit, lit);
      // Low sun paints the cloud bases with the sunset glow.
      cloud = mix(cloud, uGlow, uHorizonWarm * 0.35 * (1.0 - lit)) * uIntensity;
      col = mix(col, cloud, density * 0.72);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const envFragment = /* glsl */ `
  ${common}
  varying vec3 vDir;
  void main() {
    gl_FragColor = vec4(skyGradient(normalize(vDir)), 1.0);
  }
`;

const moonVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const moonFragment = /* glsl */ `
  uniform vec3 uLight;
  uniform float uBrightness;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    // Shade the disc as a sphere lit from the sun's true direction: the phase and the tilt of
    // the terminator come out right without any phase math.
    vec3 n = vec3(p, sqrt(1.0 - r2));
    float lit = smoothstep(-0.04, 0.1, dot(n, uLight));
    float maria = noise(p * 3.2 + 7.0) * 0.6 + noise(p * 7.0) * 0.4;
    vec3 surface = vec3(0.93, 0.91, 0.87) * (0.78 + 0.22 * smoothstep(0.35, 0.75, maria));
    vec3 col = surface * (lit + 0.035);
    float edge = smoothstep(1.0, 0.94, r2);
    gl_FragColor = vec4(col * uBrightness * 1.8, edge * clamp(uBrightness * 1.4, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ── Uniform plumbing ─────────────────────────────────────────────────────────────────────────

function skyUniforms() {
  return {
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uGround: { value: new Color() },
    uGlow: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color() },
    uMoonDir: { value: new Vector3(0, -1, 0) },
    uHorizonWarm: { value: 0 },
    uSunDisc: { value: 0 },
    uSunHalo: { value: 0 },
    uMoonGlow: { value: 0 },
    uIntensity: { value: 1.25 },
  };
}

type SkyUniforms = ReturnType<typeof skyUniforms>;

function applyLook(u: SkyUniforms, look: SkyLook, sunDir: Vector3, moonDir: Vector3) {
  u.uZenith.value.set(look.zenith);
  u.uHorizon.value.set(look.horizon);
  u.uGround.value.set(look.ground);
  u.uGlow.value.set(look.glow);
  u.uSunColor.value.set(look.sunColor);
  u.uSunDir.value.copy(sunDir);
  u.uMoonDir.value.copy(moonDir);
  u.uHorizonWarm.value = look.horizonWarm;
  u.uSunDisc.value = look.sunDisc;
  u.uSunHalo.value = look.sunHalo;
  u.uMoonGlow.value = look.moonGlow;
}

export interface SkyProps {
  look: SkyLook;
  /** Where to draw the sun and moon (display altitudes). */
  sunDir: Vector3;
  moonDir: Vector3;
  /** True direction to the sun, for lighting the moon's disc. */
  sunTrueDir: Vector3;
  cloudCover: number;
  animate: boolean;
}

const MOON_DISTANCE = 300;
const MOON_SIZE = (2.4 * Math.PI) / 180; // drawn about five times its real size so it reads on a phone

export function Sky({ look, sunDir, moonDir, sunTrueDir, cloudCover, animate }: SkyProps) {
  const camera = useThree((state) => state.camera);
  const dome = useRef<Mesh>(null);
  const moon = useRef<Mesh>(null);

  const domeMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          ...skyUniforms(),
          uTime: { value: 0 },
          uStars: { value: 0 },
          uCover: { value: 0.55 },
          uCloudLit: { value: new Color() },
          uCloudShade: { value: new Color() },
        },
        vertexShader: domeVertex,
        fragmentShader: domeFragment,
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  const moonMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uLight: { value: new Vector3(0, 0, 1) }, uBrightness: { value: 0 } },
        vertexShader: moonVertex,
        fragmentShader: moonFragment,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  const domeGeometry = useMemo(() => new SphereGeometry(500, 48, 24), []);
  const moonGeometry = useMemo(() => new PlaneGeometry(1, 1), []);

  useEffect(
    () => () => {
      domeMaterial.dispose();
      moonMaterial.dispose();
      domeGeometry.dispose();
      moonGeometry.dispose();
    },
    [domeMaterial, moonMaterial, domeGeometry, moonGeometry],
  );

  useEffect(() => {
    const u = domeMaterial.uniforms as unknown as SkyUniforms & Record<string, { value: unknown }>;
    applyLook(u, look, sunDir, moonDir);
    (u.uStars as { value: number }).value = look.stars;
    (u.uCover as { value: number }).value = cloudCover;
    (u.uCloudLit.value as Color).set(look.cloudLit);
    (u.uCloudShade.value as Color).set(look.cloudShade);
  }, [domeMaterial, look, sunDir, moonDir, cloudCover]);

  const lightView = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    domeMaterial.uniforms.uTime.value = t;
    dome.current?.position.copy(camera.position);
    const m = moon.current;
    if (m) {
      const visible = look.moonDisc > 0.01 && moonDir.y > -0.02;
      m.visible = visible;
      if (visible) {
        m.position.copy(camera.position).addScaledVector(moonDir, MOON_DISTANCE);
        m.quaternion.copy(camera.quaternion);
        m.scale.setScalar(2 * MOON_DISTANCE * Math.tan(MOON_SIZE / 2));
        lightView.copy(sunTrueDir).transformDirection(camera.matrixWorldInverse);
        moonMaterial.uniforms.uLight.value.copy(lightView);
        moonMaterial.uniforms.uBrightness.value = look.moonDisc;
      }
    }
  });

  return (
    <>
      <mesh ref={dome} geometry={domeGeometry} material={domeMaterial} renderOrder={-2} frustumCulled={false} />
      <mesh ref={moon} geometry={moonGeometry} material={moonMaterial} renderOrder={-1} frustumCulled={false} />
    </>
  );
}

/** Prefiltered environment map of the current sky, for reflections and soft ambient light. */
export function SkyEnvironment({ look, sunDir, moonDir }: { look: SkyLook; sunDir: Vector3; moonDir: Vector3 }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const pmrem = useMemo(() => new PMREMGenerator(gl), [gl]);
  const env = useMemo(() => {
    const material = new ShaderMaterial({
      uniforms: skyUniforms(),
      vertexShader: domeVertex,
      fragmentShader: envFragment,
      side: BackSide,
      depthWrite: false,
    });
    const mesh = new Mesh(new SphereGeometry(50, 32, 16), material);
    const envScene = new Scene();
    envScene.add(mesh);
    return { envScene, material, mesh };
  }, []);
  const target = useRef<WebGLRenderTarget | null>(null);
  const lastBuild = useRef(0);

  // Prefiltering renders a cube map and blurs it, so while the time-lapse runs it is rebuilt at
  // most a few times a second, with a final pass once the sky settles.
  useEffect(() => {
    const build = () => {
      lastBuild.current = performance.now();
      applyLook(env.material.uniforms as unknown as SkyUniforms, look, sunDir, moonDir);
      // The environment carries no sun disc; the key light does that job.
      env.material.uniforms.uSunHalo.value = look.sunHalo * 0.5;
      const next = pmrem.fromScene(env.envScene, 0.035);
      scene.environment = next.texture;
      scene.environmentIntensity = look.envIntensity;
      target.current?.dispose();
      target.current = next;
    };
    const wait = 250 - (performance.now() - lastBuild.current);
    if (wait <= 0) {
      build();
      return;
    }
    const timer = window.setTimeout(build, wait);
    return () => window.clearTimeout(timer);
  }, [env, look, sunDir, moonDir, pmrem, scene]);

  useEffect(
    () => () => {
      target.current?.dispose();
      pmrem.dispose();
      env.material.dispose();
      env.mesh.geometry.dispose();
      scene.environment = null;
    },
    [env, pmrem, scene],
  );

  return null;
}
