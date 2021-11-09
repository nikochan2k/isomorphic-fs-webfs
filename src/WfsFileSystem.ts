import {
  AbstractFileSystem,
  createError,
  Directory,
  ErrorLike,
  File,
  FileSystemOptions,
  joinPaths,
  normalizePath,
  NotAllowedError,
  NotSupportedError,
  PatchOptions,
  Props,
  QuotaExceededError,
  Stats,
  TypeMismatchError,
  URLOptions,
} from "univ-fs";
import { WfsDirectory } from "./WfsDirectory";
import { WfsFile } from "./WfsFile";

const requestFileSystem =
  window.requestFileSystem || (window as any).webkitRequestFileSystem; // eslint-disable-line
export class WfsFileSystem extends AbstractFileSystem {
  private fs?: FileSystem;

  constructor(
    rootDir: string,
    private size: number,
    options?: FileSystemOptions
  ) {
    super(normalizePath(rootDir), options);
  }

  public async _getDirectory(path: string): Promise<Directory> {
    return Promise.resolve(new WfsDirectory(this, path));
  }

  public async _getFS() {
    if (this.fs) {
      return this.fs;
    }

    const repository = this.repository;

    /* eslint-disable */
    if ((window as any).webkitStorageInfo) {
      await new Promise<void>((resolve, reject) => {
        const webkitStorageInfo = (window as any).webkitStorageInfo;
        webkitStorageInfo.requestQuota(
          window.PERSISTENT,
          this.size,
          () => resolve(),
          (e: unknown) =>
            reject(
              createError({
                name: QuotaExceededError.name,
                repository,
                path: "",
                e: e as ErrorLike,
              })
            )
        );
      });
    } else if ((navigator as any).webkitPersistentStorage) {
      await new Promise<void>((resolve, reject) => {
        const webkitPersistentStorage = (navigator as any)
          .webkitPersistentStorage;
        webkitPersistentStorage.requestQuota(
          this.size,
          () => resolve(),
          (e: unknown) =>
            reject(
              createError({
                name: QuotaExceededError.name,
                repository,
                path: "",
                e: e as ErrorLike,
              })
            )
        );
      });
    }
    /* eslint-enable */
    const fs = await new Promise<FileSystem>((resolve, reject) => {
      requestFileSystem(
        window.PERSISTENT,
        this.size,
        (fs) => resolve(fs),
        (e: unknown) =>
          reject(
            createError({
              name: NotAllowedError.name,
              repository,
              path: "",
              e: e as ErrorLike,
            })
          )
      );
    });
    await new Promise<void>((resolve, reject) => {
      fs.root.getDirectory(
        repository,
        { create: true },
        () => resolve(),
        (e: unknown) =>
          reject(
            createError({
              repository,
              path: "",
              e: e as ErrorLike,
            })
          )
      );
    });
    this.fs = fs;
    return fs;
  }

  public async _getFile(path: string): Promise<File> {
    return Promise.resolve(new WfsFile(this, path));
  }

  public async _head(path: string): Promise<Stats> {
    const entry = await this.getFileSystemEntry(path);
    return new Promise<Stats>((resolve, reject) => {
      entry.getMetadata(
        (metadata) => {
          const modified = metadata.modificationTime.getTime();
          if (entry.isFile) {
            resolve({ modified, size: metadata.size });
          } else {
            resolve({ modified });
          }
        },
        (e: unknown) =>
          reject(
            createError({
              repository: this.repository,
              path,
              e: e as ErrorLike,
            })
          )
      );
    });
  }

  public _patch(
    path: string,
    _props: Props, // eslint-disable-line
    _options: PatchOptions // eslint-disable-line
  ): Promise<void> {
    throw createError({
      name: NotSupportedError.name,
      repository: this.repository,
      path,
      e: { message: "patch is not supported" },
    });
  }

  public async _toURL(
    path: string,
    isDirectory: boolean, // eslint-disable-line
    options?: URLOptions
  ): Promise<string> {
    options = { urlType: "GET", ...options };
    const repository = this.repository;
    if (options.urlType !== "GET") {
      throw createError({
        name: NotSupportedError.name,
        repository,
        path,
        e: { message: `"${options.urlType}" is not supported` }, // eslint-disable-line
      });
    }
    const entry = await this.getFileSystemEntry(path);
    if (typeof entry.toURL === "function") {
      try {
        return entry.toURL();
      } catch (e) {
        console.debug(e);
      }
    }
    if (isDirectory) {
      throw createError({
        name: TypeMismatchError.name,
        repository,
        path,
        e: { message: `"${path}" is not a directory` },
      });
    }
    const file = await this.getFile(path);
    const blob = await file.read({ type: "Blob" });
    return URL.createObjectURL(blob);
  }

  private async getFileSystemEntry(
    path: string
  ): Promise<FileSystemFileEntry | FileSystemDirectoryEntry> {
    const repository = this.repository;

    const fs = await this._getFS();
    const fullPath = joinPaths(repository, path);
    const filePromise = new Promise<FileSystemFileEntry>((resolve, reject) => {
      fs.root.getFile(fullPath, { create: false }, resolve, reject);
    });
    const dirPromise = new Promise<FileSystemDirectoryEntry>(
      (resolve, reject) => {
        fs.root.getDirectory(fullPath, { create: false }, resolve, reject);
      }
    );
    const results = await Promise.allSettled([filePromise, dirPromise]);
    if (results[0].status === "fulfilled") {
      return results[0].value;
    } else if (results[1].status === "fulfilled") {
      return results[1].value;
    } else {
      const err1 = createError({
        repository: this.repository,
        path,
        e: results[0].reason as ErrorLike,
      });
      const err2 = createError({
        repository: this.repository,
        path,
        e: results[1].reason as ErrorLike,
      });
      if (
        err1.name === TypeMismatchError.name ||
        err1.name === TypeError.name
      ) {
        throw err2;
      } else {
        throw err1;
      }
    }
  }
}
