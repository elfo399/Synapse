import { constants } from "node:fs";
import { mkdir, open, unlink, access } from "node:fs/promises";
import path from "node:path";

export interface StorageProvider {
  save(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class LocalFilesystemStorage implements StorageProvider {
  constructor(readonly root: string) {}
  path(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid storage key");
    return path.join(path.resolve(this.root), "objects", key);
  }
  async save(key: string, bytes: Uint8Array) {
    const destination = this.path(key);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const handle = await open(destination, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await this.delete(key);
      throw error;
    }
    await handle.close();
  }
  async read(key: string) {
    const handle = await open(
      this.path(key),
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      if (!(await handle.stat()).isFile())
        throw new Error("Invalid stored object");
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }
  async delete(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  async exists(key: string) {
    try {
      await access(this.path(key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}

export function attachmentStorage(): StorageProvider {
  return new LocalFilesystemStorage(
    process.env.ATTACHMENT_STORAGE_PATH ||
      path.join(process.cwd(), "data", "attachments"),
  );
}
