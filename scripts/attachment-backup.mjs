/* Private storage maintenance and a deliberately path-free backup format.
 * Each record is JSON metadata + newline + exact file bytes + newline.
 * Only opaque 64-hex keys are accepted; no archive paths are ever extracted. */
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";
const root = path.resolve(
  process.env.ATTACHMENT_STORAGE_PATH || "data/attachments",
);
const objects = path.join(root, "objects");
const keyPattern = /^[a-f0-9]{64}$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const db = new PrismaClient();
const [command, token] = process.argv.slice(2);
function temporary(kind) {
  if (!/^[a-f0-9]{32}$/.test(token || ""))
    throw new Error("Invalid restore token");
  return path.join(root, `.${kind}-${token}`);
}
async function readObject(key) {
  if (!keyPattern.test(key)) throw new Error("Invalid storage key");
  const file = await fs.open(
    path.join(objects, key),
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 256 * 1024 * 1024)
      throw new Error("Invalid stored object");
    return await file.readFile();
  } finally {
    await file.close();
  }
}
async function metadata() {
  // Backups made during the first upgrade can legitimately predate attachments.
  const tables =
    await db.$queryRaw`SELECT to_regclass('public."Attachment"')::text AS name`;
  return tables[0]?.name
    ? db.attachment.findMany({
        select: { storageKey: true, size: true, sha256: true },
        orderBy: { storageKey: "asc" },
      })
    : [];
}
async function output(value) {
  if (!process.stdout.write(value)) await once(process.stdout, "drain");
}
async function verify() {
  const files = await metadata();
  for (const file of files) {
    const bytes = await readObject(file.storageKey);
    if (bytes.length !== file.size || digest(bytes) !== file.sha256)
      throw new Error(`Attachment verification failed: ${file.storageKey}`);
  }
  return files;
}
async function exportPack() {
  for (const file of await metadata()) {
    const bytes = await readObject(file.storageKey);
    if (bytes.length !== file.size || digest(bytes) !== file.sha256)
      throw new Error(`Attachment verification failed: ${file.storageKey}`);
    await output(
      JSON.stringify({
        key: file.storageKey,
        size: file.size,
        sha256: file.sha256,
      }) + "\n",
    );
    await output(bytes);
    await output("\n");
  }
  await output('{"end":true}\n');
}
async function stage() {
  const target = temporary("staging");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.mkdir(target, { mode: 0o700 }); // refuses token reuse
  const iterator = process.stdin[Symbol.asyncIterator]();
  let buffered = Buffer.alloc(0);
  let eof = false;
  async function fill() {
    const next = await iterator.next();
    eof = Boolean(next.done);
    if (!eof) buffered = Buffer.concat([buffered, next.value]);
  }
  async function line() {
    while (!buffered.includes(10)) {
      if (buffered.length > 4096 || eof) throw new Error("Invalid pack header");
      await fill();
    }
    const end = buffered.indexOf(10);
    if (end > 4096) throw new Error("Oversized pack header");
    const value = buffered.subarray(0, end).toString("utf8");
    buffered = buffered.subarray(end + 1);
    return value;
  }
  try {
    while (true) {
      const record = JSON.parse(await line());
      if (record.end === true) {
        if (Object.keys(record).length !== 1)
          throw new Error("Invalid terminator");
        while (!eof) {
          if (buffered.length) throw new Error("Trailing pack data");
          await fill();
        }
        if (buffered.length) throw new Error("Trailing pack data");
        break;
      }
      if (
        !keyPattern.test(record.key) ||
        !keyPattern.test(record.sha256) ||
        !Number.isSafeInteger(record.size) ||
        record.size < 1 ||
        record.size > 256 * 1024 * 1024
      )
        throw new Error("Invalid pack record");
      while (buffered.length < record.size + 1 && !eof) await fill();
      if (buffered.length < record.size + 1 || buffered[record.size] !== 10)
        throw new Error("Truncated pack record");
      const bytes = buffered.subarray(0, record.size);
      if (digest(bytes) !== record.sha256)
        throw new Error("Pack checksum mismatch");
      await fs.writeFile(path.join(target, record.key), bytes, {
        flag: "wx",
        mode: 0o600,
      });
      buffered = buffered.subarray(record.size + 1);
    }
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true });
    throw error;
  }
}
async function activate() {
  const previous = temporary("previous"),
    staging = temporary("staging");
  await fs.mkdir(objects, { recursive: true, mode: 0o700 });
  await fs.rename(objects, previous);
  try {
    await fs.rename(staging, objects);
  } catch (error) {
    await fs.rename(previous, objects);
    throw error;
  }
}
async function rollback() {
  const previous = temporary("previous"),
    failed = temporary("failed");
  await fs.access(previous); // never remove live storage without a rollback copy
  await fs.rename(objects, failed);
  try {
    await fs.rename(previous, objects);
  } catch (error) {
    await fs.rename(failed, objects);
    throw error;
  }
  await fs.rm(failed, { recursive: true, force: true });
}
async function maintain() {
  await fs.mkdir(objects, { recursive: true, mode: 0o700 });
  for (const pending of await db.attachmentDeletion.findMany()) {
    if (!keyPattern.test(pending.storageKey))
      throw new Error("Invalid deletion key");
    try {
      await fs.rm(path.join(objects, pending.storageKey), { force: true });
      await db.attachmentDeletion.deleteMany({
        where: { storageKey: pending.storageKey },
      });
    } catch {
      console.error("Deferred attachment deletion", pending.storageKey);
    }
  }
  const referenced = new Set((await metadata()).map((file) => file.storageKey));
  for (const entry of await fs.readdir(objects, { withFileTypes: true })) {
    if (
      !entry.isFile() ||
      !keyPattern.test(entry.name) ||
      referenced.has(entry.name)
    )
      continue;
    const target = path.join(objects, entry.name);
    if ((await fs.stat(target)).mtimeMs < Date.now() - 86400000)
      await fs.unlink(target);
  }
}
(async () => {
  if (command === "export") await exportPack();
  else if (command === "verify") {
    const files = await verify();
    console.error(`Verified ${files.length} private attachments.`);
  } else if (command === "stage") await stage();
  else if (command === "activate") await activate();
  else if (command === "rollback") await rollback();
  else if (command === "finalize") {
    await fs.rm(temporary("previous"), { recursive: true, force: true });
    await fs.rm(temporary("staging"), { recursive: true, force: true });
  } else if (command === "maintain") await maintain();
  else
    throw new Error(
      "Expected export, verify, stage, activate, rollback, finalize or maintain",
    );
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
