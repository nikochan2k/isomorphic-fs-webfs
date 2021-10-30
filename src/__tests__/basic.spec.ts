import { testAll } from "univ-fs/lib/__tests__/basic";
import { WfsFileSystem } from "../WfsFileSystem";

const fs = new WfsFileSystem("/isomorphic-fs-test", 50 * 1024 * 1024);
testAll(fs, async () => {
  const dir = await fs.getDirectory("/");
  const paths = await dir.readdir({ ignoreHook: true });
  for (const path of paths) {
    await fs.rm(path, { recursive: true, force: true, ignoreHook: true });
  }
});
