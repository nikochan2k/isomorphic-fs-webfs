import { Converter, Data } from "univ-conv";
import {
  AbortError,
  AbstractFile,
  createError,
  ErrorLike,
  joinPaths,
  NoModificationAllowedError,
  OpenOptions,
  WriteOptions,
} from "univ-fs";
import { WfsFileSystem } from "./WfsFileSystem";

export class WfsFile extends AbstractFile {
  constructor(public wfs: WfsFileSystem, path: string) {
    super(wfs, path);
  }

  public async _rm(): Promise<void> {
    const wfs = this.wfs;
    const path = this.path;
    const repository = wfs.repository;
    const fullPath = joinPaths(repository, path);

    const fs = await wfs._getFS();
    return new Promise<void>((resolve, reject) => {
      fs.root.getFile(
        fullPath,
        { create: false },
        (entry) =>
          entry.remove(resolve, (e) =>
            reject(createError({ repository, path, e: e as ErrorLike }))
          ),
        (e) => reject(createError({ repository, path, e: e as ErrorLike }))
      );
    });
  }

  protected async _load(
    _options: OpenOptions // eslint-disable-line
  ): Promise<Data> {
    const wfs = this.wfs;
    const repository = wfs.repository;
    const path = this.path;
    const fullPath = joinPaths(repository, path);

    const fs = await wfs._getFS();
    return new Promise<File>((resolve, reject) => {
      const error = (e: unknown) =>
        reject(createError({ repository, path, e: e as ErrorLike }));
      fs.root.getFile(
        fullPath,
        { create: false },
        (entry) => entry.file((file) => resolve(file), error),
        error
      );
    });
  }

  protected async _save(data: Data, options: WriteOptions): Promise<void> {
    const repository = this.fs.repository;
    const path = this.path;
    const fullPath = joinPaths(repository, path);

    const converter = new Converter(options);
    const stream = await converter.toReadableStream(data);
    const reader = stream.getReader();

    const fs = await this.wfs._getFS();
    const writer = await new Promise<FileWriter>((resolve, reject) => {
      const handle = (e: unknown) =>
        reject(createError({ repository, path, e: e as ErrorLike }));
      fs.root.getFile(
        fullPath,
        { create: true },
        (entry) =>
          entry.createWriter((w) => {
            void (async () => {
              if (options.append) {
                const stats = await this.head(options);
                const size = stats.size as number;
                w.seek(size);
                resolve(w);
              } else {
                this._handle(w, resolve, reject);
                w.truncate(0);
              }
            })();
          }, handle),
        handle
      );
    });

    try {
      let res = await reader.read();
      while (!res.done) {
        const chunk = res.value;
        if (chunk != null) {
          const blob = await converter.toBlob(chunk as Data);
          await new Promise<void>((resolve, reject) => {
            this._handle(writer, () => resolve(), reject);
            writer.write(blob);
          });
        }
        res = await reader.read();
      }
      await reader.cancel();
    } catch (err) {
      await reader.cancel(err);
      throw err;
    }
  }

  private _handle(
    writer: FileWriter,
    resolve: (value: FileWriter | PromiseLike<FileWriter>) => void,
    reject: (reason?: ErrorLike) => void
  ) {
    const repository = this.fs.repository;
    const path = this.path;
    const removeEvents = () => {
      delete (writer as Partial<FileWriter>).onabort;
      delete (writer as Partial<FileWriter>).onerror;
      delete (writer as Partial<FileWriter>).onwriteend;
    };
    writer.onabort = (e: unknown) => {
      removeEvents();
      reject(
        createError({
          name: AbortError.name,
          repository,
          path,
          e: e as ErrorLike,
        })
      );
    };
    writer.onerror = (e: unknown) => {
      removeEvents();
      reject(
        createError({
          name: NoModificationAllowedError.name,
          repository,
          path,
          e: e as ErrorLike,
        })
      );
    };
    writer.onwriteend = () => {
      removeEvents();
      resolve(writer);
    };
  }
}
