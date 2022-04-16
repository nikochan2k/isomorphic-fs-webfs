import { ErrorLike, NotFoundError } from "univ-fs";
import { WfsFileSystem } from "../WfsFileSystem";

export const fs = new WfsFileSystem("/isomorphic-fs-test", 50 * 1024 * 1024);

export const setup = async () => {
  try {
    const root = await fs._getDirectory("/");
    await root.rm({ force: true, recursive: true, ignoreHook: true });
    await root.mkdir({ force: true, recursive: false, ignoreHook: true });
  } catch (e) {
    if ((e as ErrorLike).name !== NotFoundError.name) {
      throw e;
    }
  }
};
