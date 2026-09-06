import "fake-indexeddb/auto";
import { test, expect } from "bun:test";
import { saveImage, getImage, deleteImage, purgeExpiredImages } from "./image-store";

test("saveImage then getImage round-trips a Blob", async () => {
  const blob = new Blob(["receipt bytes"], { type: "image/jpeg" });
  await saveImage("a", blob);
  const result = await getImage("a");
  expect(result).not.toBeNull();
  expect(await result!.text()).toBe("receipt bytes");
});

test("getImage returns null for an unknown id", async () => {
  expect(await getImage("does-not-exist")).toBeNull();
});

test("deleteImage removes a stored image", async () => {
  await saveImage("b", new Blob(["x"]));
  await deleteImage("b");
  expect(await getImage("b")).toBeNull();
});

test("purgeExpiredImages removes entries older than the cutoff, keeps newer ones", async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("expense-notes-images", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("images", "readwrite");
    const store = tx.objectStore("images");
    store.put({ id: "old", blob: new Blob(["old"]), savedAt: now - 50 * DAY });
    store.put({ id: "fresh", blob: new Blob(["fresh"]), savedAt: now - 1 * DAY });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  await purgeExpiredImages(45);

  expect(await getImage("old")).toBeNull();
  expect(await getImage("fresh")).not.toBeNull();
});
