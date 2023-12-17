import { IDBPDatabase, openDB } from "idb";
import { JSONValue } from "./util/json";

interface PersistentStoreConstructor {
  new (): PersistentStoreInterface;
}

interface PersistentStoreInterface {
  checkpoint(clientGroupID: string, cookie: JSONValue, data: Map<string, JSONValue>): Promise<void>;
  fork(clientGroupID: string): Promise<{ cookie: JSONValue; data: Map<string, JSONValue> } | null>;
}

function createPersistentStore(ctor: PersistentStoreConstructor): PersistentStoreInterface {
  return new ctor();
}

class PersistentStore implements PersistentStoreInterface {
  private _metaObjectStoreName = "meta";
  private _keysObjectStoreName = "keys";

  async checkpoint(
    clientGroupID: string,
    cookie: JSONValue,
    data: Map<string, JSONValue>,
  ): Promise<void> {
    const db = await this._getDB();
    const tx = db.transaction([this._metaObjectStoreName, this._keysObjectStoreName], "readwrite");
    const metaStore = tx.objectStore(this._metaObjectStoreName);
    const keysStore = tx.objectStore(this._keysObjectStoreName);
    // write the cookie
    await metaStore.put({ key: this._keyWithPrefix(clientGroupID, "cookie"), value: cookie });
    // upsert the keys in the data
    for (const [key, value] of data) {
      await keysStore.put({ key: this._keyWithPrefix(clientGroupID, key), value });
    }
    // delete the keys not in the data
    for (const key of await keysStore.getAllKeys()) {
      const exists = data.has(this._keyWithoutPrefix(clientGroupID, key.toString()));
      if (!exists) await keysStore.delete(key);
    }
    await tx.done;
  }

  async fork(
    clientGroupID: string,
  ): Promise<{ cookie: JSONValue; data: Map<string, JSONValue> } | null> {
    const db = await this._getDB();
    const tx = db.transaction([this._metaObjectStoreName, this._keysObjectStoreName], "readonly");
    // read the cookie
    type CookieObject = { key: string; value: JSONValue };
    const cookie = (await tx
      .objectStore(this._metaObjectStoreName)
      .get(this._keyWithPrefix(clientGroupID, "cookie"))) as CookieObject | undefined;
    if (cookie === undefined) return null;
    // read the data
    const data = new Map<string, JSONValue>();
    type KeyObject = { key: string; value: JSONValue };
    for (const key of await tx.objectStore(this._keysObjectStoreName).getAllKeys()) {
      const prefix = this._keyWithPrefix(clientGroupID, "");
      if (!key.toString().startsWith(prefix)) continue;
      const item = (await tx.objectStore(this._keysObjectStoreName).get(key)) as KeyObject;
      data.set(item.key.slice(prefix.length), item.value);
    }
    await tx.done;
    return { cookie: cookie.value, data };
  }

  private _db: IDBPDatabase | null = null;
  private async _getDB() {
    if (!this._db) {
      this._db = await openDB("optimistik", 1, {
        upgrade(db) {
          db.createObjectStore("meta", { keyPath: "key" });
          db.createObjectStore("keys", { keyPath: "key" });
        },
      });
    }
    return this._db;
  }

  private _keyWithPrefix(clientGroupID: string, key: string) {
    return `${clientGroupID}::${key}`;
  }

  private _keyWithoutPrefix(clientGroupID: string, key: string) {
    const prefix = this._keyWithPrefix(clientGroupID, "");
    return key.slice(prefix.length);
  }
}

export {
  PersistentStore,
  createPersistentStore,
  type PersistentStoreConstructor,
  type PersistentStoreInterface,
};
