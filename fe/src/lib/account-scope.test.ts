import { test, expect, beforeEach } from "bun:test";

// ponytail: same in-memory localStorage shim as expense.test.ts/sync-queue.test.ts.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
globalThis.localStorage = new MemoryStorage() as unknown as Storage;

const { scopedKey, migrateLegacyKey, claimAccountSlot } = await import("./account-scope");
const BASE = "expense-notes.expenses.v1";

beforeEach(() => {
  localStorage.clear();
});

test("scopedKey defaults to the anonymous slot before any account has connected", () => {
  expect(scopedKey(BASE)).toBe(`${BASE}.__local__`);
});

test("migrateLegacyKey moves a bare pre-namespacing key under the current slot exactly once", () => {
  localStorage.setItem(BASE, JSON.stringify(["legacy data"]));
  migrateLegacyKey(BASE);
  expect(localStorage.getItem(BASE)).toBe(null);
  expect(localStorage.getItem(scopedKey(BASE))).toBe(JSON.stringify(["legacy data"]));

  // second call is a no-op — nothing left to migrate
  localStorage.setItem(BASE, JSON.stringify(["should not overwrite"]));
  migrateLegacyKey(BASE);
  expect(localStorage.getItem(scopedKey(BASE))).toBe(JSON.stringify(["legacy data"]));
});

test("migrateLegacyKey never overwrites data already sitting under the scoped key", () => {
  localStorage.setItem(scopedKey(BASE), JSON.stringify(["already scoped"]));
  localStorage.setItem(BASE, JSON.stringify(["stale legacy"]));
  migrateLegacyKey(BASE);
  expect(localStorage.getItem(scopedKey(BASE))).toBe(JSON.stringify(["already scoped"]));
});

test("claimAccountSlot on a device's first-ever connect migrates the anonymous slot's data to the new email's slot", () => {
  localStorage.setItem(`${BASE}.__local__`, JSON.stringify(["pre-connect local data"]));

  claimAccountSlot("Alice@Example.com", [BASE]);

  expect(scopedKey(BASE)).toBe(`${BASE}.alice@example.com`); // lowercased/trimmed
  expect(localStorage.getItem(scopedKey(BASE))).toBe(JSON.stringify(["pre-connect local data"]));
  expect(localStorage.getItem(`${BASE}.__local__`)).toBe(null); // moved, not copied
});

test("claimAccountSlot for a second, different email does not migrate the first account's data", () => {
  claimAccountSlot("alice@example.com", [BASE]);
  localStorage.setItem(scopedKey(BASE), JSON.stringify(["alice's data"]));

  claimAccountSlot("bob@example.com", [BASE]);

  expect(scopedKey(BASE)).toBe(`${BASE}.bob@example.com`);
  expect(localStorage.getItem(scopedKey(BASE))).toBe(null); // bob starts empty
  expect(localStorage.getItem(`${BASE}.alice@example.com`)).toBe(JSON.stringify(["alice's data"])); // untouched
});

test("claimAccountSlot reconnecting the same email is idempotent", () => {
  claimAccountSlot("alice@example.com", [BASE]);
  localStorage.setItem(scopedKey(BASE), JSON.stringify(["alice's data"]));

  claimAccountSlot("alice@example.com", [BASE]);

  expect(localStorage.getItem(scopedKey(BASE))).toBe(JSON.stringify(["alice's data"]));
});
