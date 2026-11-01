import { BoxGeometry, BufferAttribute, BufferGeometry, ShapeUtils, Vector2, Vector3 } from 'three';

// Geometry helpers for the house shell and the lot. Textured surfaces take their texture
// coordinates from world positions (in TILE units), so brick courses, siding boards and pavers
// line up across separate pieces and never stretch with a piece's size.

/** Meters covered by one texture tile. */
export const TILE = 1.6;

interface WorldBoxData {
  y0: number;
  span: number;
}

/**
 * A box whose texture coordinates are world positions in TILE units. Built 1 m tall: the wall
 * code scales it to the visible height and positions it from `y0` (the bottom, in world height
 * with the house assembled).
 */
export function worldBox(w: number, d: number, fullHeight: number, center: readonly [number, number], y0: number): BufferGeometry {
  const geometry = new BoxGeometry(w, 1, d);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i += 1) {
    const x = center[0] + position.getX(i);
    const y = y0 + (position.getY(i) + 0.5) * fullHeight;
    const z = center[1] + position.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    let u: number;
    let v: number;
    if (Math.abs(ny) > 0.5) {
      u = x;
      v = z;
    } else if (Math.abs(nx) > 0.5) {
      u = nx > 0 ? -z : z;
      v = y;
    } else {
      u = nz > 0 ? x : -x;
      v = y;
    }
    uv.setXY(i, u / TILE, v / TILE);
  }
  uv.needsUpdate = true;
  geometry.userData.worldBox = { y0, span: fullHeight } satisfies WorldBoxData;
  return geometry;
}

/**
 * Re-fits a world box's texture to a new visible height, so a wall cut down for a view keeps its
 * brick courses instead of squashing them.
 */
export function setWorldBoxSpan(geometry: BufferGeometry, span: number) {
  const data = geometry.userData.worldBox as WorldBoxData | undefined;
  if (!data || Math.abs(data.span - span) < 1e-4) return;
  data.span = span;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i += 1) {
    if (Math.abs(normal.getY(i)) > 0.5) continue;
    uv.setY(i, (data.y0 + (position.getY(i) + 0.5) * span) / TILE);
  }
  uv.needsUpdate = true;
}

/**
 * A solid spanning [x0, x1] × [z0, z1] from `bottom` up to a top surface that follows `top` at
 * its corners (a sloped driveway, a stepped wall). World texture coordinates.
 */
export function slabGeometry(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  top: number | ((x: number, z: number) => number),
  bottom: number,
): BufferGeometry {
  const geometry = new BoxGeometry(1, 1, 1);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const topAt = typeof top === 'number' ? () => top : top;
  for (let i = 0; i < position.count; i += 1) {
    const x = x0 + (position.getX(i) + 0.5) * (x1 - x0);
    const z = z0 + (position.getZ(i) + 0.5) * (z1 - z0);
    const y = position.getY(i) > 0 ? topAt(x, z) : bottom;
    position.setXYZ(i, x, y, z);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    if (Math.abs(ny) > 0.5) uv.setXY(i, x / TILE, z / TILE);
    else if (Math.abs(nx) > 0.5) uv.setXY(i, (nx > 0 ? -z : z) / TILE, y / TILE);
    else uv.setXY(i, (nz > 0 ? x : -x) / TILE, y / TILE);
  }
  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A flat polygon in 3D (all points on one plane) facing `normal`, with texture coordinates in
 * TILE units measured along `uAxis` and `vAxis` from `origin`.
 */
export function polygonGeometry(points: readonly Vector3[], normal: Vector3, uAxis: Vector3, vAxis: Vector3, origin: Vector3 = new Vector3()): BufferGeometry {
  const flat = points.map((p) => {
    const rel = p.clone().sub(origin);
    return new Vector2(rel.dot(uAxis), rel.dot(vAxis));
  });
  const triangles = ShapeUtils.triangulateShape(flat, []);
  const positions = new Float32Array(points.length * 3);
  const normals = new Float32Array(points.length * 3);
  const uvs = new Float32Array(points.length * 2);
  points.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    normals.set([normal.x, normal.y, normal.z], i * 3);
    uvs.set([flat[i].x / TILE, flat[i].y / TILE], i * 2);
  });
  const index: number[] = [];
  const ab = new Vector3();
  const ac = new Vector3();
  for (const [a, b, c] of triangles) {
    ab.subVectors(points[b], points[a]);
    ac.subVectors(points[c], points[a]);
    // Keep each triangle wound so it faces `normal`.
    if (ab.cross(ac).dot(normal) >= 0) index.push(a, b, c);
    else index.push(a, c, b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Merges plain geometries (positions, normals, uvs, indices) into one. */
export function mergeGeometries(parts: readonly BufferGeometry[]): BufferGeometry {
  let vertices = 0;
  let indices = 0;
  for (const part of parts) {
    vertices += part.getAttribute('position').count;
    indices += part.index ? part.index.count : part.getAttribute('position').count;
  }
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const index = new Uint32Array(indices);
  let v = 0;
  let k = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    const normal = part.getAttribute('normal');
    const uv = part.getAttribute('uv');
    for (let i = 0; i < position.count; i += 1) {
      positions.set([position.getX(i), position.getY(i), position.getZ(i)], (v + i) * 3);
      if (normal) normals.set([normal.getX(i), normal.getY(i), normal.getZ(i)], (v + i) * 3);
      if (uv) uvs.set([uv.getX(i), uv.getY(i)], (v + i) * 2);
    }
    if (part.index) for (let i = 0; i < part.index.count; i += 1) index[k + i] = part.index.getX(i) + v;
    else for (let i = 0; i < position.count; i += 1) index[k + i] = v + i;
    v += position.count;
    k += part.index ? part.index.count : position.count;
    part.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A patch lying on uneven ground: a grid over [x0, x1] × [z0, z1] (or a disc when `round`) whose
 * vertices follow `heightAt`, lifted a little to sit on top of it.
 */
export function drapedPatch(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  heightAt: (x: number, z: number) => number,
  { lift = 0.03, step = 0.35, round = false }: { lift?: number; step?: number; round?: boolean } = {},
): BufferGeometry {
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rx = (x1 - x0) / 2;
  const rz = (z1 - z0) / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= nz; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      let x = x0 + ((x1 - x0) * i) / nx;
      let z = z0 + ((z1 - z0) * j) / nz;
      if (round) {
        // Squeeze the square grid onto the disc (corners land on the rim).
        const u = (x - cx) / rx;
        const w = (z - cz) / rz;
        x = cx + rx * u * Math.sqrt(1 - (w * w) / 2);
        z = cz + rz * w * Math.sqrt(1 - (u * u) / 2);
      }
      positions.push(x, heightAt(x, z) + lift, z);
      uvs.push(x / TILE, z / TILE);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
