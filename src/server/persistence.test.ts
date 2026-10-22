import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db';
import { GcsPersistence } from './persistence';

/** In-memory stand-in for the Cloud Storage JSON API (one object, generation preconditions). */
function fakeGcs() {
  const store: { data: Buffer | null; generation: number } = { data: null, generation: 0 };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.startsWith('/upload/')) {
      const expected = Number(url.searchParams.get('ifGenerationMatch'));
      if (expected !== store.generation) return new Response('precondition failed', { status: 412 });
      store.data = Buffer.from(init!.body as Uint8Array);
      store.generation += 1;
      return Response.json({ generation: String(store.generation) });
    }
    if (!store.data) return new Response('not found', { status: 404 });
    if (url.searchParams.get('alt') === 'media') {
      return new Response(new Uint8Array(store.data), {
        headers: { 'x-goog-generation': String(store.generation) },
      });
    }
    return Response.json({ generation: String(store.generation) });
  }) as typeof fetch;
  return { store, fetchImpl };
}

const dirs: string[] = [];
function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hos-test-'));
  dirs.push(dir);
  return path.join(dir, 'household.db');
}
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('GcsPersistence', () => {
  it('snapshots after writes and restores on a fresh instance', async () => {
    const gcs = fakeGcs();
    const options = { bucket: 'b', object: 'household.db', token: async () => 't', fetch: gcs.fetchImpl, log: { info() {}, warn() {}, error() {} } };

    const firstPath = tempDb();
    const first = new GcsPersistence(options);
    await first.restore(firstPath);
    const db = openDatabase(firstPath);
    first.attach(db);
    await first.flush();
    expect(gcs.store.generation).toBe(0); // nothing changed yet, nothing uploaded

    db.prepare(`INSERT INTO households VALUES ('h1', 'Home', 'UTC', '{}', '2026-01-01')`).run();
    await first.flush();
    expect(gcs.store.generation).toBe(1);
    db.close();

    // A new container starts with an empty disk and pulls the snapshot.
    const secondPath = tempDb();
    const second = new GcsPersistence(options);
    await second.restore(secondPath);
    const restored = openDatabase(secondPath);
    expect(restored.prepare('SELECT name FROM households').get()).toEqual({ name: 'Home' });
    second.attach(restored);
    restored.prepare(`UPDATE households SET name = 'Our home'`).run();
    await second.flush();
    expect(gcs.store.generation).toBe(2);
    restored.close();
  });

  it('recovers from a generation conflict', async () => {
    const gcs = fakeGcs();
    const options = { bucket: 'b', object: 'household.db', token: async () => 't', fetch: gcs.fetchImpl, log: { info() {}, warn() {}, error() {} } };
    const persistence = new GcsPersistence(options);
    const file = tempDb();
    await persistence.restore(file);
    const db = openDatabase(file);
    persistence.attach(db);
    gcs.store.data = Buffer.from('someone else');
    gcs.store.generation = 7;
    db.prepare(`INSERT INTO households VALUES ('h1', 'Home', 'UTC', '{}', '2026-01-01')`).run();
    await persistence.flush();
    expect(gcs.store.generation).toBe(8);
    db.close();
  });
});
