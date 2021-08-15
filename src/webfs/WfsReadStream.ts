import {
  AbstractReadStream,
  createError,
  OpenOptions,
  path as p,
} from "isomorphic-fs";
import { WfsFile } from "./WfsFile";
import { WfsFileSystem } from "./WfsFileSystem";

export class WfsReadStream extends AbstractReadStream {
  constructor(file: WfsFile, options: OpenOptions) {
    super(file, options);
  }

  public async _close(): Promise<void> {
    this._dispose();
  }

  public async _read(size?: number): Promise<Uint8Array | null> {
    const file = await this._open();
    if (file.size <= this.position) {
      return null;
    }
    let end = this.position + (size == null ? this.bufferSize : size);
    if (file.size < end) {
      end = file.size;
    }
    const blob = file.slice(this.position, end);
    const buffer = await this.converter.toUint8Array(blob);
    return buffer;
  }

  protected async _seek(start: number): Promise<void> {
    this.position = start;
  }

  private _dispose() {}

  private async _open(): Promise<File> {
    const file = this.file as WfsFile;
    const wfs = file.fs as WfsFileSystem;
    const fs = await wfs._getFS();
    return new Promise<File>(async (resolve, reject) => {
      const repository = wfs.repository;
      const path = file.path;
      const handle = (e: any) => reject(createError({ repository, path, e }));
      const fullPath = p.joinPaths(repository, path);
      fs.root.getFile(
        fullPath,
        { create: false },
        (entry) => {
          entry.file((file) => {
            resolve(file);
          }, handle);
        },
        handle
      );
    });
  }
}
