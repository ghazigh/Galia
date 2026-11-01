import { useFrame, useThree } from '@react-three/fiber';
import CameraControls from 'camera-controls';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import {
  Box3,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { Framing } from './layout';

CameraControls.install({ THREE: { Box3, Matrix4, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4 } });

const DEG = Math.PI / 180;

/**
 * Vertical field of view for the part of the canvas the user can see. The horizontal angle stays
 * fixed, so dragging the sheet never rescales the house: a taller region just shows more sky.
 */
export function visibleFov(aspect: number): number {
  const horizontal = 46 * DEG;
  const vertical = 2 * Math.atan(Math.tan(horizontal / 2) / aspect);
  return Math.min(78 * DEG, Math.max(34 * DEG, vertical));
}

/**
 * Camera distance (and orbit center) that fits a framing box in the visible part of the screen,
 * solved per box corner for a pinhole camera at the framing's angles.
 */
export function fitFraming(framing: Framing, aspect: number): { center: Vector3; distance: number } {
  const vfov = visibleFov(aspect);
  const tanV = Math.tan(vfov / 2);
  const tanH = tanV * aspect;
  const center = new Vector3(
    (framing.min[0] + framing.max[0]) / 2,
    (framing.min[1] + framing.max[1]) / 2,
    (framing.min[2] + framing.max[2]) / 2,
  );
  const sp = Math.sin(framing.polar);
  // Unit vector from the center toward the camera, and the camera's right and up axes.
  const back = new Vector3(sp * Math.sin(framing.azimuth), Math.cos(framing.polar), sp * Math.cos(framing.azimuth));
  const right = new Vector3(0, 1, 0).cross(back).normalize();
  const up = back.clone().cross(right).normalize();
  let distance = 1;
  const corner = new Vector3();
  for (const x of [framing.min[0], framing.max[0]])
    for (const y of [framing.min[1], framing.max[1]])
      for (const z of [framing.min[2], framing.max[2]]) {
        corner.set(x, y, z).sub(center);
        const toward = corner.dot(back); // how far the corner sits toward the camera
        distance = Math.max(distance, toward + Math.abs(corner.dot(right)) / tanH, toward + Math.abs(corner.dot(up)) / tanV);
      }
  return { center, distance: distance * 1.04 };
}

export interface RigHandle {
  controls: CameraControls | null;
  /** Fly back to the current view's framing. */
  reset: () => void;
}

export interface CameraRigProps {
  framing: Framing;
  /** Changes whenever the camera should fly to `framing` again. */
  flyKey: string;
  /** Pixels at the bottom of the canvas covered by UI (the home sheet). */
  insetBottom: MutableRefObject<number>;
  /** Pixels at the top kept clear of the house (header, room for labels). */
  insetTop: number;
  interactive: boolean;
  autoRotate: boolean;
  smooth: boolean;
  handle: MutableRefObject<RigHandle>;
  onUserMove: (moved: boolean) => void;
}

export function CameraRig({ framing, flyKey, insetBottom, insetTop, interactive, autoRotate, smooth, handle, onUserMove }: CameraRigProps) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useMemo(() => new CameraControls(camera, gl.domElement), [camera, gl]);
  const lastInteraction = useRef(0);
  // Callbacks change identity on every render; the controls must not be rebuilt for that.
  const onUserMoveRef = useRef(onUserMove);
  useEffect(() => {
    onUserMoveRef.current = onUserMove;
  });

  useEffect(() => {
    controls.smoothTime = 0.42;
    controls.draggingSmoothTime = 0.1;
    controls.azimuthRotateSpeed = 0.55;
    controls.polarRotateSpeed = 0.55;
    controls.dollySpeed = 0.6;
    controls.truckSpeed = 1.2;
    controls.minPolarAngle = 8 * DEG;
    controls.maxPolarAngle = 88 * DEG;
    controls.dollyToCursor = true;
    controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
    controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
    controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
    controls.mouseButtons.middle = CameraControls.ACTION.DOLLY;
    controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = CameraControls.ACTION.TOUCH_TRUCK;
    // Keep the orbit point near the house so a stray pan can't lose it.
    controls.setBoundary(new Box3(new Vector3(-15, -1, -11), new Vector3(16, 16, 13)));
    controls.boundaryEnclosesCamera = false;
    // Dev tooling (screenshots, the scene playground) can steer the camera directly.
    if (import.meta.env.DEV) (window as unknown as { __houseCamera?: CameraControls }).__houseCamera = controls;
    const onStart = () => {
      lastInteraction.current = performance.now();
      onUserMoveRef.current(true);
    };
    const onWake = () => invalidate();
    controls.addEventListener('controlstart', onStart);
    controls.addEventListener('update', onWake);
    return () => {
      controls.removeEventListener('controlstart', onStart);
      controls.removeEventListener('update', onWake);
      controls.dispose();
    };
  }, [controls, invalidate]);

  useEffect(() => {
    controls.enabled = interactive;
  }, [controls, interactive]);

  const fly = useMemo(
    () => (target: Framing, animate: boolean) => {
      const visibleHeight = Math.max(160, size.height - insetBottom.current - insetTop);
      const { center, distance } = fitFraming(target, size.width / visibleHeight);
      controls.minDistance = distance * 0.3;
      controls.maxDistance = distance * 2.3;
      const sp = Math.sin(target.polar);
      void controls.setLookAt(
        center.x + distance * sp * Math.sin(target.azimuth),
        center.y + distance * Math.cos(target.polar),
        center.z + distance * sp * Math.cos(target.azimuth),
        center.x,
        center.y,
        center.z,
        animate,
      );
      onUserMoveRef.current(false);
    },
    [controls, insetBottom, insetTop, size.height, size.width],
  );

  // Fly whenever the view (or a reset) asks for it. The first framing is instant.
  const first = useRef(true);
  useEffect(() => {
    fly(framing, smooth && !first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);

  useEffect(() => {
    handle.current = { controls, reset: () => fly(framing, smooth) };
  }, [controls, fly, framing, handle, smooth]);

  useFrame((_, delta) => {
    // Center the scene between the header and the sheet, with a fixed visible field of view.
    const fullHeight = size.height;
    const visibleHeight = Math.max(160, fullHeight - insetBottom.current - insetTop);
    const vfov = visibleFov(size.width / visibleHeight);
    const fov = (2 * Math.atan((Math.tan(vfov / 2) * fullHeight) / visibleHeight)) / DEG;
    const shift = (insetBottom.current - insetTop) / 2;
    if (Math.abs(camera.fov - fov) > 0.01 || camera.view?.offsetY !== shift || camera.view?.fullWidth !== size.width) {
      camera.fov = fov;
      camera.setViewOffset(size.width, fullHeight, 0, shift, size.width, fullHeight);
      camera.updateProjectionMatrix();
    }
    if (autoRotate && interactive && performance.now() - lastInteraction.current > 6000) {
      void controls.rotate(delta * 0.06, 0, false);
    }
    controls.update(delta);
  });

  return null;
}
