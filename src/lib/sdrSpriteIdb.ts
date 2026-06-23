const DB_NAME = "bingo-catalog-sdr-sprites";
const DB_VERSION = 1;
const STORE_NAME = "sprites";

type StoredSprite = {
  cacheKey: string;
  width: number;
  height: number;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
      }
    };
  });
}

export async function idbGetSprite(
  cacheKey: string,
): Promise<StoredSprite | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(cacheKey);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      resolve(req.result as StoredSprite | undefined);
      db.close();
    };
  });
}

export async function idbPutSprite(entry: StoredSprite): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(entry);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      resolve();
      db.close();
    };
  });
}

export async function idbClearSprites(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      resolve();
      db.close();
    };
  });
}

export async function blobToImageBitmap(
  blob: Blob,
): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

export async function imageBitmapToBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2d unavailable");
  ctx.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return blob;
}
