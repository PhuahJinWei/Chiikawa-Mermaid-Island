/**
 * The photos you take of the island (the user, 2026-10-22), kept in the browser (IndexedDB), the newest
 * first, as many as KEEP: the oldest go as new ones come. Each is a JPEG no wider or higher than SIDE.
 */

export interface Photo {
  id: number;
  /** When it was taken (milliseconds since 1970), and the island's hour and day then. */
  time: number;
  hours: number;
  day: number;
  blob: Blob;
}

const DB = 'mermaid-island';
const STORE = 'photos';
const KEEP = 48;
/** The longest side of a photo, in pixels. */
export const SIDE = 1600;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((done, fail) => {
    r.onsuccess = () => done(r.result);
    r.onerror = () => fail(r.error);
  });
}

export class Album {
  private readonly db: Promise<IDBDatabase | null>;

  constructor() {
    this.db = new Promise((done) => {
      try {
        const open = indexedDB.open(DB, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        open.onsuccess = () => done(open.result);
        open.onerror = () => done(null);
      } catch {
        // No storage here (a private window): photos are taken but not kept.
        done(null);
      }
    });
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore | null> {
    const db = await this.db;
    return db ? db.transaction(STORE, mode).objectStore(STORE) : null;
  }

  /** Keeps a photo; the oldest go once there are more than KEEP. */
  async add(blob: Blob, hours: number, day: number): Promise<void> {
    const store = await this.store('readwrite');
    if (!store) return;
    await request(store.add({ time: Date.now(), hours, day, blob }));
    const keys = (await request(store.getAllKeys())) as number[];
    for (const key of keys.slice(0, Math.max(0, keys.length - KEEP))) store.delete(key);
  }

  /** Every photo kept, the newest first. */
  async list(): Promise<Photo[]> {
    const store = await this.store('readonly');
    if (!store) return [];
    const all = (await request(store.getAll())) as Photo[];
    return all.reverse();
  }

  /** The newest photo kept, or null. */
  async newest(): Promise<Photo | null> {
    const store = await this.store('readonly');
    if (!store) return null;
    const cursor = await request(store.openCursor(null, 'prev'));
    return cursor ? (cursor.value as Photo) : null;
  }

  async remove(id: number): Promise<void> {
    const store = await this.store('readwrite');
    if (store) await request(store.delete(id));
  }
}
