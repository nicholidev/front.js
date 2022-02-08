import type {
  SessionStorage,
  SessionIdStorageStrategy
} from "@remix-run/server-runtime";
import { createSessionStorage } from "@remix-run/server-runtime";

interface KVSessionStorageOptions {
  /**
   * The Cookie used to store the session id on the client, or options used
   * to automatically create one.
   */
  cookie?: SessionIdStorageStrategy["cookie"];

  /**
   * The KVNamespace used to store the sessions.
   */
  kv: KVNamespace;
}

/**
 * Creates a SessionStorage that stores session data in the Clouldflare KV Store.
 *
 * The advantage of using this instead of cookie session storage is that
 * KV Store may contain much more data than cookies.
 *
 * @see https://remix.run/docs/en/v1/api/remix#createcloudflarekvsessionstorage-cloudflare-workers
 */
export function createCloudflareKVSessionStorage({
  cookie,
  kv
}: KVSessionStorageOptions): SessionStorage {
  return createSessionStorage({
    cookie,
    async createData(data, expires) {
      while (true) {
        let randomBytes = new Uint8Array(8);
        crypto.getRandomValues(randomBytes);
        // This storage manages an id space of 2^64 ids, which is far greater
        // than the maximum number of files allowed on an NTFS or ext4 volume
        // (2^32). However, the larger id space should help to avoid collisions
        // with existing ids when creating new sessions, which speeds things up.
        let id = [...randomBytes]
          .map(x => x.toString(16).padStart(2, "0"))
          .join("");

        if (await kv.get(id, "json")) {
          continue;
        }

        await kv.put(id, JSON.stringify(data), {
          expiration: expires ? Math.round(expires.getTime() / 1000) : undefined
        });

        return id;
      }
    },
    async readData(id) {
      let session = await kv.get(id);

      if (!session) {
        return null;
      }

      return JSON.parse(session);
    },
    async updateData(id, data, expires) {
      await kv.put(id, JSON.stringify(data), {
        expiration: expires ? Math.round(expires.getTime() / 1000) : undefined
      });
    },
    async deleteData(id) {
      await kv.delete(id);
    }
  });
}
