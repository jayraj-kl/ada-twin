// Drawn images are megabytes each, too big for localStorage, so they live in
// IndexedDB under keys that start with the project's id. Like everything
// else, they stay in this browser until projects are stored on the server.
const DATABASE = "ada-twin";
const STORE = "images";

export interface StoredImage {
  mimeType: string;
  /** Base64. */
  data: string;
  /** The model's turn that made it, to send back when it is revised. */
  turn?: unknown;
}

let opened: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    opened = null;
    throw error;
  });
  return opened;
}

async function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const imageKey = (projectId: string, ...parts: string[]) =>
  [projectId, ...parts].join(":");

export async function saveImage(key: string, image: StoredImage) {
  await transact("readwrite", (store) => store.put(image, key));
  // Asks the browser not to clear the images when space runs low.
  void navigator.storage?.persist?.().catch(() => false);
}

export function loadImage(key: string): Promise<StoredImage | undefined> {
  return transact("readonly", (store) => store.get(key) as IDBRequest<StoredImage | undefined>);
}

/** Removes every image whose key starts with `prefix`. */
export function deleteImages(prefix: string): Promise<undefined> {
  return transact("readwrite", (store) =>
    store.delete(IDBKeyRange.bound(prefix, `${prefix}￿`)),
  );
}
