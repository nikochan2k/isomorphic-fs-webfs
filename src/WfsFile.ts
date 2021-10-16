import {
  AbstractFile,
  AbstractReadStream,
  AbstractWriteStream,
  createError,
  joinPaths,
  OpenOptions,
  OpenWriteOptions,
} from "univ-fs";
import { WfsFileSystem } from "./WfsFileSystem";
import { WfsReadStream } from "./WfsReadStream";
import { WfsWriteStream } from "./WfsWriteStream";

export class WfsFile extends AbstractFile {
  constructor(public wfsFS: WfsFileSystem, path: string) {
    super(wfsFS, path);
  }

  public async _createReadStream(
    options: OpenOptions
  ): Promise<AbstractReadStream> {
    return new WfsReadStream(this, options);
  }

  public async _createWriteStream(
    post: boolean,
    options: OpenWriteOptions
  ): Promise<AbstractWriteStream> {
    const wfsFS = this.wfsFS;
    const fs = await wfsFS._getFS();
    if (post) {
      await new Promise<void>((resolve, reject) => {
        const fullPath = joinPaths(wfsFS.repository, this.path);
        fs.root.getFile(
          fullPath,
          { create: true },
          () => resolve(),
          (e) =>
            reject(
              createError({
                repository: wfsFS.repository,
                path: this.path,
                e,
              })
            )
        );
      });
    }
    return new WfsWriteStream(this, options);
  }

  public async _rm(): Promise<void> {
    const wfsFS = this.wfsFS;
    const fs = await wfsFS._getFS();
    return new Promise<void>((resolve, reject) => {
      const fullPath = joinPaths(wfsFS.repository, this.path);
      fs.root.getFile(
        fullPath,
        { create: false },
        (entry) =>
          entry.remove(resolve, (e) =>
            reject(
              createError({
                repository: wfsFS.repository,
                path: this.path,
                e,
              })
            )
          ),
        (e) =>
          reject(
            createError({
              repository: this.fs.repository,
              path: this.path,
              e,
            })
          )
      );
    });
  }
}
