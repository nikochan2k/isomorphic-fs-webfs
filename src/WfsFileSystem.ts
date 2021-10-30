import {
  AbstractFileSystem,
  createError,
  Directory,
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
  URLType,
} from "univ-fs";
import { WfsDirectory } from "./WfsDirectory";
import { WfsFile } from "./WfsFile";

const requestFileSystem =
  window.requestFileSystem || (window as any).webkitRequestFileSystem;
export class WfsFileSystem extends AbstractFileSystem {
  private fs?: FileSystem;

  constructor(
    rootDir: string,
    private size: number,
    options?: FileSystemOptions
  ) {
    super(normalizePath(rootDir), options);
  }

  public async _getFS() {
    if (this.fs) {
      return this.fs;
    }

    const repository = this.repository;

    if ((window as any).webkitStorageInfo) {
      await new Promise<void>((resolve, reject) => {
        const webkitStorageInfo = (window as any).webkitStorageInfo;
        webkitStorageInfo.requestQuota(
          window.PERSISTENT,
          this.size,
          () => resolve(),
          (e: any) =>
            reject(
              createError({
                name: QuotaExceededError.name,
                repository,
                path: "",
                e,
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
          (e: any) =>
            reject(
              createError({
                name: QuotaExceededError.name,
                repository,
                path: "",
                e,
              })
            )
        );
      });
    }
    const fs = await new Promise<FileSystem>((resolve, reject) => {
      requestFileSystem(
        window.PERSISTENT,
        this.size,
        (fs) => resolve(fs),
        (e) =>
          reject(
            createError({
              name: NotAllowedError.name,
              repository,
              path: "",
              e,
            })
          )
      );
    });
    await new Promise<void>((resolve, reject) => {
      fs.root.getDirectory(
        repository,
        { create: true },
        () => resolve(),
        (e) =>
          reject(
            createError({
              repository,
              path: "",
              e,
            })
          )
      );
    });
    this.fs = fs;
    return fs;
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
        (e) =>
          reject(
            createError({
              repository: this.repository,
              path,
              e,
            })
          )
      );
    });
  }

  public _patch(
    path: string,
    _props: Props,
    _options: PatchOptions
  ): Promise<void> {
    throw createError({
      name: NotSupportedError.name,
      repository: this.repository,
      path,
      e: "patch is not supported",
    });
  }

  public async getDirectory(path: string): Promise<Directory> {
    return new WfsDirectory(this, path);
  }

  public async getFile(path: string): Promise<File> {
    return new WfsFile(this, path);
  }

  public async toURL(path: string, urlType: URLType = "GET"): Promise<string> {
    if (urlType !== "GET") {
      throw createError({
        name: NotSupportedError.name,
        repository: this.repository,
        path,
        e: `"${urlType}" is not supported`,
      });
    }
    const entry = await this.getFileSystemEntry(path);
    if (typeof entry.toURL === "function") {
      try {
        return entry.toURL();
      } catch {}
    }
    const file = await this.getFile(path);
    const blob = await file.read({ type: "Blob" });
    return URL.createObjectURL(blob);
  }

  private async getFileSystemEntry(path: string) {
    const repository = this.repository;

    const fs = await this._getFS();
    return new Promise<FileSystemFileEntry | FileSystemDirectoryEntry>(
      (resolve, reject) => {
        let rejected: any;
        const handle = (e: any) => {
          if (rejected) {
            reject(createError({ repository, path, e }));
          }
          rejected = e;
        };
        const fullPath = joinPaths(repository, path);
        fs.root.getFile(fullPath, { create: false }, resolve, handle);
        fs.root.getDirectory(fullPath, { create: false }, resolve, handle);
      }
    );
  }
}
