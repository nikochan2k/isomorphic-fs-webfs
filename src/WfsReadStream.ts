import {
  AbstractReadStream,
  createError,
  joinPaths,
  OpenReadOptions,
  Source,
  SourceType,
} from "univ-fs";
import { WfsFile } from "./WfsFile";

export class WfsReadStream extends AbstractReadStream {
  constructor(private wfsFile: WfsFile, options: OpenReadOptions) {
    super(wfsFile, options);
  }

  public async _close(): Promise<void> {
    this._dispose();
  }

  public async _read(size?: number): Promise<Source | null> {
    const file = await this._open();
    const fileSize = file.size;
    if (fileSize <= this.position) {
      return null;
    }
    let end = this.position + (size == null ? this.bufferSize : size);
    if (fileSize < end) {
      end = fileSize;
    }
    return file.slice(this.position, end);
  }

  protected async _seek(_start: number): Promise<void> {}

  protected getDefaultSourceType(): SourceType {
    return "Blob";
  }

  private _dispose() {}

  private async _open(): Promise<File> {
    const wfsFile = this.wfsFile;
    const wfsFS = wfsFile.wfsFS;
    const fs = await wfsFS._getFS();
    return new Promise<File>(async (resolve, reject) => {
      const repository = wfsFS.repository;
      const path = wfsFile.path;
      const handle = (e: any) => reject(createError({ repository, path, e }));
      const fullPath = joinPaths(repository, path);
      fs.root.getFile(
        fullPath,
        { create: false },
        (entry) => entry.file((file) => resolve(file), handle),
        handle
      );
    });
  }
}
