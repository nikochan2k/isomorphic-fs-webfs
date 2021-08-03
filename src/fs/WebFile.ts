import {
  AbstractFile,
  AbstractReadStream,
  AbstractWriteStream,
  OpenOptions,
  OpenWriteOptions,
  util,
} from "isomorphic-fs";
import { getName } from "isomorphic-fs/lib/util";
import { convertError, WebFileSystem } from "./WebFileSystem";
import { WebReadStream } from "./WebReadStream";
import { WebWriteStream } from "./WebWriteStream";

export class WebFile extends AbstractFile {
  constructor(public wfs: WebFileSystem, path: string) {
    super(wfs, path);
  }

  public async _createReadStream(
    options: OpenOptions
  ): Promise<AbstractReadStream> {
    return new WebReadStream(this, options);
  }

  public async _createWriteStream(
    options: OpenWriteOptions
  ): Promise<AbstractWriteStream> {
    const fs = await this.wfs._getFS();
    if (options.create) {
      await new Promise<void>((resolve, reject) => {
        const fullPath = util.joinPaths(this.fs.repository, this.path);
        fs.root.getFile(
          fullPath,
          { create: true },
          () => resolve(),
          (err: any) => reject(convertError(this.fs.repository, this.path, err))
        );
      });
    }
    return new WebWriteStream(this, options);
  }

  public async _rm(): Promise<void> {
    const fs = await this.wfs._getFS();
    return new Promise<void>((resolve, reject) => {
      const fullPath = util.joinPaths(this.fs.repository, this.path);
      fs.root.getFile(
        fullPath,
        { create: false },
        (entry) =>
          entry.remove(resolve, (err) =>
            reject(convertError(this.fs.repository, this.path, err))
          ),
        (err) => reject(convertError(this.fs.repository, this.path, err))
      );
    });
  }
}
