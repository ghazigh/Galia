import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Db } from './db';

/**
 * Durability for the SQLite file.
 *
 * Locally (or on a VM with a disk) the database file is the source of truth. On Cloud Run the
 * filesystem is ephemeral, so `GcsPersistence` restores the latest snapshot from a Cloud Storage
 * object at startup and uploads a fresh snapshot after every request that changed data, before
 * the response is sent. Uploads are conditional on the object generation, so a second instance
 * writing concurrently is detected instead of silently overwritten. Enable object versioning on
 * the bucket to keep point-in-time history for free.
 */
export interface Persistence {
  readonly kind: 'local' | 'gcs';
  /** Called before the database is opened. */
  restore(databasePath: string): Promise<void>;
  attach(db: Db): void;
  /** Persists outstanding changes; resolves once they are durable. */
  flush(): Promise<void>;
}

export class LocalPersistence implements Persistence {
  readonly kind = 'local';
  async restore(): Promise<void> {}
  attach(): void {}
  async flush(): Promise<void> {}
}

type Fetch = typeof fetch;

export interface GcsOptions {
  bucket: string;
  object: string;
  token: () => Promise<string>;
  fetch?: Fetch;
  apiBase?: string;
  log?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/** Access token from the Cloud Run / GCE metadata server (or GCS_ACCESS_TOKEN for local testing). */
export function metadataToken(fetchImpl: Fetch = fetch): () => Promise<string> {
  let cached: { token: string; expiresAt: number } | null = null;
  return async () => {
    const override = process.env.GCS_ACCESS_TOKEN;
    if (override) return override;
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    const res = await fetchImpl(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (!res.ok) throw new Error(`Metadata server returned ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return cached.token;
  };
}

export class GcsPersistence implements Persistence {
  readonly kind = 'gcs';
  private db: Db | null = null;
  /** Generation of the object we last read or wrote (0 = must not exist yet). */
  private generation = '0';
  private flushedChanges = -1;
  private queue: Promise<void> = Promise.resolve();
  private readonly fetch: Fetch;
  private readonly apiBase: string;
  private readonly log: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly options: GcsOptions) {
    this.fetch = options.fetch ?? fetch;
    this.apiBase = (options.apiBase ?? 'https://storage.googleapis.com').replace(/\/+$/, '');
    this.log = options.log ?? console;
  }

  private objectUrl(): string {
    return `${this.apiBase}/storage/v1/b/${encodeURIComponent(this.options.bucket)}/o/${encodeURIComponent(this.options.object)}`;
  }

  private async headers(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.options.token()}` };
  }

  private async currentGeneration(): Promise<string> {
    const res = await this.fetch(this.objectUrl(), { headers: await this.headers() });
    if (res.status === 404) return '0';
    if (!res.ok) throw new Error(`GCS metadata request failed: ${res.status} ${await res.text()}`);
    return String(((await res.json()) as { generation: string }).generation);
  }

  async restore(databasePath: string): Promise<void> {
    if (fs.existsSync(databasePath)) {
      this.generation = await this.currentGeneration();
      this.log.info(`[persistence] using existing local database; remote generation ${this.generation}`);
      return;
    }
    const res = await this.fetch(`${this.objectUrl()}?alt=media`, { headers: await this.headers() });
    if (res.status === 404) {
      this.generation = '0';
      this.log.info('[persistence] no snapshot in Cloud Storage yet — starting fresh');
      return;
    }
    if (!res.ok) throw new Error(`GCS download failed: ${res.status} ${await res.text()}`);
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const tmp = `${databasePath}.download`;
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(tmp, databasePath);
    this.generation = res.headers.get('x-goog-generation') ?? (await this.currentGeneration());
    this.log.info(`[persistence] restored snapshot generation ${this.generation}`);
  }

  attach(db: Db): void {
    this.db = db;
    this.flushedChanges = this.totalChanges();
  }

  private totalChanges(): number {
    return (this.db!.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
  }

  flush(): Promise<void> {
    const run = this.queue.then(() => this.flushNow());
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async flushNow(): Promise<void> {
    if (!this.db) return;
    const changes = this.totalChanges();
    if (changes === this.flushedChanges) return;
    const snapshot = path.join(os.tmpdir(), `household-snapshot-${process.pid}.db`);
    await this.db.backup(snapshot);
    const body = await fs.promises.readFile(snapshot);
    await fs.promises.rm(snapshot, { force: true });

    let res = await this.upload(body);
    if (res.status === 412) {
      // Someone else wrote a newer snapshot (e.g. an overlapping revision during a deploy).
      this.log.warn('[persistence] snapshot generation changed underneath us; overwriting with latest state');
      this.generation = await this.currentGeneration();
      res = await this.upload(body);
    }
    if (!res.ok) throw new Error(`GCS upload failed: ${res.status} ${await res.text()}`);
    this.generation = String(((await res.json()) as { generation: string }).generation);
    this.flushedChanges = changes;
  }

  private async upload(body: Buffer): Promise<Response> {
    const url =
      `${this.apiBase}/upload/storage/v1/b/${encodeURIComponent(this.options.bucket)}/o` +
      `?uploadType=media&name=${encodeURIComponent(this.options.object)}&ifGenerationMatch=${this.generation}`;
    return this.fetch(url, {
      method: 'POST',
      headers: { ...(await this.headers()), 'content-type': 'application/octet-stream' },
      body: new Uint8Array(body),
    });
  }
}
