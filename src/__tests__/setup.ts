import {
  ErrorLike,
  NotFoundError,
  OnExists,
  OnNoParent,
  OnNotExist,
} from "univ-fs";
import { WfsFileSystem } from "../WfsFileSystem";

export const fs = new WfsFileSystem("/isomorphic-fs-test", 50 * 1024 * 1024);

export const setup = async () => {
  try {
    const root = await fs.getDirectory("/");
    await root.rm({
      onNotExist: OnNotExist.Ignore,
      recursive: true,
      ignoreHook: true,
    });
    await root.mkdir({
      onExists: OnExists.Ignore,
      onNoParent: OnNoParent.Error,
      ignoreHook: true,
    });
  } catch (e) {
    if ((e as ErrorLike).name !== NotFoundError.name) {
      throw e;
    }
  }
};
