import { AbstractReadStream, OpenOptions, util } from "isomorphic-fs";
import { toArrayBuffer } from "../util/buffer";
import { WebFile } from "./WebFile";
import { convertError } from "./WebFileSystem";

export class WebReadStream extends AbstractReadStream {
  constructor(private wf: WebFile, options: OpenOptions) {
    super(wf, options);
  }

  public async _close(): Promise<void> {
    this._dispose();
  }

  public async _read(size?: number): Promise<ArrayBuffer | null> {
    const file = await this._open();
    if (file.size <= this.position) {
      return null;
    }
    let end = this.position + (size == null ? this.bufferSize : size);
    if (file.size < end) {
      end = file.size;
    }
    const blob = file.slice(this.position, end);
    const buffer = await toArrayBuffer(blob);
    return buffer;
  }

  protected async _seek(start: number): Promise<void> {
    this.position = start;
  }

  private _dispose() {}

  private async _open(): Promise<File> {
    const wf = this.wf;
    const wfs = wf.wfs;
    const fs = await wfs._getFS();
    return new Promise<File>(async (resolve, reject) => {
      const repository = wfs.repository;
      const path = wf.path;
      const handle = (err: FileError) =>
        reject(convertError(repository, path, err));
      const fullPath = util.joinPaths(repository, path);
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
