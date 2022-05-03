import { ConvertOptions, Data, handleReadableStream } from "univ-conv";
import {
  AbortError,
  AbstractFile,
  createError,
  ErrorLike,
  joinPaths,
  NoModificationAllowedError,
  ReadOptions,
  Stats,
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

  public supportAppend(): boolean {
    return true;
  }

  public supportRangeRead(): boolean {
    return false;
  }

  public supportRangeWrite(): boolean {
    return true;
  }

  // eslint-disable-next-line
  protected async _load(_stats: Stats, _options: ReadOptions): Promise<Data> {
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

  protected async _save(
    data: Data,
    _stats: Stats,
    options: WriteOptions
  ): Promise<void> {
    const repository = this.fs.repository;
    const path = this.path;
    const fullPath = joinPaths(repository, path);

    const converter = this._getConverter();
    const co: Partial<ConvertOptions> = { ...options };
    delete co.start;
    const stream = await converter.toReadableStream(data, co);

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
              if (typeof options.start === "number") {
                w.seek(options.start);
                resolve(w);
              } else if (options.append) {
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

    await handleReadableStream(stream, async (chunk) => {
      const blob = await converter.toBlob(chunk);
      await new Promise((resolve, reject) => {
        this._handle(writer, resolve, reject);
        writer.write(blob);
      });
      return true;
    });
  }

  private _handle(
    writer: FileWriter,
    resolve: (value: FileWriter | PromiseLike<FileWriter>) => void,
    reject: (reason?: ErrorLike) => void
  ) {
    const repository = this.fs.repository;
    const path = this.path;
    const removeEvents = () => {
      writer.removeEventListener("abort", null);
      writer.removeEventListener("error", null);
      writer.removeEventListener("writeend", null);
    };
    writer.addEventListener("abort", (e: unknown) => {
      reject(
        createError({
          name: AbortError.name,
          repository,
          path,
          e: e as ErrorLike,
        })
      );
      removeEvents();
    });
    writer.addEventListener("error", (e: unknown) => {
      reject(
        createError({
          name: NoModificationAllowedError.name,
          repository,
          path,
          e: e as ErrorLike,
        })
      );
      removeEvents();
    });
    writer.addEventListener("writeend", () => {
      resolve(writer);
      removeEvents();
    });
  }
}
