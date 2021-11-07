import { WfsFileSystem } from "../WfsFileSystem";

export const fs = new WfsFileSystem("/isomorphic-fs-test", 50 * 1024 * 1024);

export const setup = async () => {
  const dir = await fs.getDirectory("/");
  const paths = await dir.readdir({ ignoreHook: true });
  for (const path of paths) {
    await fs.rm(path, { recursive: true, force: true, ignoreHook: true });
  }
};
