import {
  AbortError,
  AbstractWriteStream,
  createError,
  NoModificationAllowedError,
  OpenWriteOptions,
  util,
} from "isomorphic-fs";
import { toArrayBuffer } from "isomorphic-fs/lib/util";
import { WfsFile } from "./WfsFile";

export class WfsWriteStream extends AbstractWriteStream {
  private opened = false;

  constructor(private wf: WfsFile, options: OpenWriteOptions) {
    super(wf, options);
  }

  public async _close(): Promise<void> {
    this.opened = false;
  }

  public async _truncate(size: number): Promise<void> {
    await this._process((writer) => writer.truncate(size));
  }

  public async _write(buffer: ArrayBuffer | Uint8Array): Promise<void> {
    await this._process((writer) => {
      const ab = toArrayBuffer(buffer);
      const blob = new Blob([ab]);
      writer.write(blob);
    });
  }

  protected async _seek(start: number): Promise<void> {
    const writer = await this._getWriter();
    writer.seek(start);
  }

  private async _getWriter(): Promise<FileWriter> {
    const wf = this.wf;
    const repository = wf.fs.repository;
    const path = wf.path;
    const fullPath = util.joinPaths(repository, path);
    const fs = await this.wf.wfs._getFS();
    return new Promise<FileWriter>((resolve, reject) => {
      const handle = (e: any) => reject(createError({ repository, path, e }));
      fs.root.getFile(
        fullPath,
        { create: true },
        (entry) =>
          entry.createWriter(async (writer) => {
            if (this.opened) {
              writer.seek(this.position);
              resolve(writer);
            } else {
              this.opened = true;
              if (this.options.append) {
                const stats = await wf.head();
                const size = stats.size as number;
                writer.seek(size);
                this.position = size;
                resolve(writer);
              } else {
                const removeEvents = () => {
                  writer.onabort = undefined as any;
                  writer.onerror = undefined as any;
                  writer.onwriteend = undefined as any;
                };
                writer.onabort = (e) => {
                  removeEvents();
                  reject(
                    createError({
                      name: AbortError.name,
                      repository,
                      path,
                      e,
                    })
                  );
                };
                writer.onerror = (e) => {
                  removeEvents();
                  reject(
                    createError({
                      name: NoModificationAllowedError.name,
                      repository,
                      path,
                      e,
                    })
                  );
                };
                writer.onwriteend = () => {
                  removeEvents();
                  resolve(writer);
                };
                writer.truncate(0);
              }
            }
          }, handle),
        handle
      );
    });
  }

  private async _process(handle: (writer: FileWriter) => void) {
    const writer = await this._getWriter();
    return new Promise<void>((resolve, reject) => {
      const wf = this.wf;
      const repository = wf.fs.repository;
      const path = wf.path;
      writer.onabort = (e) =>
        reject(
          createError({
            name: AbortError.name,
            repository,
            path,
            e,
          })
        );
      writer.onerror = (e) =>
        reject(
          createError({
            name: NoModificationAllowedError.name,
            repository,
            path,
            e,
          })
        );
      writer.onwriteend = () => {
        resolve();
      };
      handle(writer);
    });
  }
}
