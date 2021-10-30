import { Converter, Source } from "univ-conv";
import {
  AbortError,
  AbstractFile,
  createError,
  joinPaths,
  NoModificationAllowedError,
  OpenOptions,
  WriteOptions,
} from "univ-fs";
import { WfsFileSystem } from "./WfsFileSystem";

export class WfsFile extends AbstractFile {
  constructor(public wfsFS: WfsFileSystem, path: string) {
    super(wfsFS, path);
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

  protected async _getSource(_options: OpenOptions): Promise<Source> {
    const wfsFS = this.wfsFS;
    const repository = wfsFS.repository;
    const path = this.path;
    const fullPath = joinPaths(repository, path);

    const fs = await wfsFS._getFS();
    return new Promise<File>(async (resolve, reject) => {
      const handle = (e: any) => reject(createError({ repository, path, e }));
      fs.root.getFile(
        fullPath,
        { create: false },
        (entry) => entry.file((file) => resolve(file), handle),
        handle
      );
    });
  }

  protected async _write(src: Source, options: WriteOptions): Promise<void> {
    const repository = this.fs.repository;
    const path = this.path;
    const fullPath = joinPaths(repository, path);

    const converter = new Converter(options);
    const stream = await converter.toReadableStream(src);
    const reader = stream.getReader();

    const fs = await this.wfsFS._getFS();
    const writer = await new Promise<FileWriter>((resolve, reject) => {
      const handle = (e: any) => reject(createError({ repository, path, e }));
      fs.root.getFile(
        fullPath,
        { create: true },
        (entry) =>
          entry.createWriter(async (w) => {
            if (options.append) {
              const stats = await this.head(options);
              const size = stats.size as number;
              w.seek(size);
              resolve(w);
            } else {
              this._handle(w, resolve, reject);
              w.truncate(0);
            }
          }, handle),
        handle
      );
    });

    try {
      let res = await reader.read();
      while (!res.done) {
        const chunk = res.value;
        if (chunk != null) {
          const blob = await converter.toBlob(chunk);
          await new Promise<void>((resolve, reject) => {
            this._handle(writer, () => resolve(), reject);
            writer.write(blob);
          });
        }
        res = await reader.read();
      }
      reader.cancel();
    } catch (err) {
      reader.cancel(err);
      throw err;
    }
  }

  private async _handle(
    writer: FileWriter,
    resolve: (value: FileWriter | PromiseLike<FileWriter>) => void,
    reject: (reason?: any) => void
  ) {
    const repository = this.fs.repository;
    const path = this.path;
    const removeEvents = () => {
      delete (writer as any).onabort;
      delete (writer as any).onerror;
      delete (writer as any).onwriteend;
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
  }
}
