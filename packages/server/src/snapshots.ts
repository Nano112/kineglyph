import { createHash, randomBytes } from "node:crypto";
import { checkOptions } from "./config.js";
import {
  constants,
  closeSync,
  fsyncSync,
  fstatSync,
  futimesSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { LIMITS, RequestError } from "./schema.js";
export interface SnapshotOptions {
  directory: string;
  publicBaseUrl: string;
  ttlSeconds: number;
  maxBytes: number;
  maxCount: number;
  retentionSeconds: number;
}
const namePattern = /^[a-f0-9]{64}\.png$/;
/** Single process, private directory. No request-controlled filesystem paths. */
export function createSnapshotStore(options: SnapshotOptions) {
  checkOptions(options, [
    "directory",
    "publicBaseUrl",
    "ttlSeconds",
    "maxBytes",
    "maxCount",
    "retentionSeconds",
  ]);
  const config = { ...options };
  if (!isAbsolute(config.directory)) throw new Error("snapshot directory must be absolute");
  const base = new URL(config.publicBaseUrl);
  if (
    !/^https?:$/.test(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new Error("invalid snapshot publicBaseUrl (use an origin)");
  for (const [value, max] of [
    [config.ttlSeconds, 2592000],
    [config.retentionSeconds, 31536000],
    [config.maxCount, 100000],
    [config.maxBytes, 10000000000],
  ])
    if (!Number.isSafeInteger(value) || value! < 1 || value! > max!)
      throw new Error("invalid snapshot limits");
  if (config.retentionSeconds < config.ttlSeconds)
    throw new Error("snapshot retention must cover TTL");
  mkdirSync(config.directory, { recursive: true, mode: 0o700 });
  const root = lstatSync(config.directory);
  if (
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.mode & 0o077 ||
    (process.getuid && root.uid !== process.getuid())
  )
    throw new Error("snapshot directory must be private and not a symlink");
  const directory = realpathSync(config.directory);
  const entries = new Map<string, { size: number; created: number }>();
  let total = 0;
  function assertDirectory() {
    const current = lstatSync(directory);
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== root.dev ||
      current.ino !== root.ino
    )
      throw new Error("snapshot directory changed");
  }
  function syncDirectory() {
    const fd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  function remove(name: string) {
    const entry = entries.get(name)!;
    unlinkSync(join(directory, name));
    entries.delete(name);
    total -= entry.size;
    syncDirectory();
  }
  function prune(extraBytes = 0, extraCount = 0) {
    assertDirectory();
    const now = Date.now();
    for (const [name, entry] of [...entries].sort((a, b) => a[1].created - b[1].created)) {
      if (
        now - entry.created >= config.retentionSeconds * 1000 ||
        total + extraBytes > config.maxBytes ||
        entries.size + extraCount > config.maxCount
      )
        remove(name);
    }
  }
  const names = readdirSync(directory);
  if (names.length > 100001) throw new Error("snapshot directory inventory too large");
  for (const name of names) {
    const path = join(directory, name),
      stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error("unsafe snapshot entry");
    if (/^\.tmp-[a-f0-9]{32}$/.test(name)) {
      unlinkSync(path);
      continue;
    }
    if (!namePattern.test(name) || stat.size > LIMITS.outputBytes || stat.mtimeMs > Date.now())
      throw new Error("invalid snapshot entry");
    entries.set(name, { size: stat.size, created: stat.mtimeMs });
    total += stat.size;
  }
  prune();
  return {
    publish(bytes: Buffer): string {
      assertDirectory();
      prune();
      if (bytes.length > config.maxBytes || bytes.length > LIMITS.outputBytes)
        throw new RequestError("snapshot storage capacity reached", 507);
      const name = `${createHash("sha256").update(bytes).digest("hex")}.png`;
      if (!entries.has(name)) {
        prune(bytes.length, 1);
        const temp = join(directory, `.tmp-${randomBytes(16).toString("hex")}`);
        const fd = openSync(
          temp,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600,
        );
        try {
          writeFileSync(fd, bytes);
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        try {
          linkSync(temp, join(directory, name));
        } finally {
          unlinkSync(temp);
        }
        syncDirectory();
        entries.set(name, { size: bytes.length, created: Date.now() });
        total += bytes.length;
      } else {
        const fd = openSync(
          join(directory, name),
          constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
          const stat = fstatSync(fd);
          if (
            !stat.isFile() ||
            stat.nlink !== 1 ||
            stat.size !== bytes.length ||
            !readFileSync(fd).equals(bytes)
          )
            throw new Error("snapshot identity changed");
          const now = new Date();
          futimesSync(fd, now, now);
          fsyncSync(fd);
          entries.get(name)!.created = now.getTime();
        } finally {
          closeSync(fd);
        }
      }
      return new URL(`/images/${name}`, base).href;
    },
    read(name: string): Buffer {
      assertDirectory();
      prune();
      if (!namePattern.test(name) || !entries.has(name)) throw new RequestError("not found", 404);
      let fd: number;
      try {
        fd = openSync(
          join(directory, name),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
      } catch {
        throw new RequestError("not found", 404);
      }
      try {
        const stat = fstatSync(fd),
          entry = entries.get(name)!;
        if (
          !stat.isFile() ||
          stat.nlink !== 1 ||
          stat.size !== entry.size ||
          stat.size > LIMITS.outputBytes
        )
          throw new RequestError("not found", 404);
        const bytes = readFileSync(fd);
        if (`${createHash("sha256").update(bytes).digest("hex")}.png` !== name)
          throw new RequestError("not found", 404);
        return bytes;
      } finally {
        closeSync(fd);
      }
    },
  };
}
