import {
  AbortError,
  AbstractFileSystem,
  AbstractFileSystemError,
  Directory,
  EncodingError,
  File,
  FileSystemOptions,
  HeadOptions,
  InvalidModificationError,
  InvalidStateError,
  NoModificationAllowedError,
  NotFoundError,
  NotReadableError,
  NotSupportedError,
  PatchOptions,
  PathExistsError,
  Props,
  QuotaExceededError,
  SecurityError,
  Stats,
  SyntaxError,
  TypeMismatchError,
  URLType,
  util,
} from "isomorphic-fs";
import { WebDirectory } from "./WebDirectory";
import { WebFile } from "./WebFile";

export function convertError(repository: string, path: string, err: any) {
  if (err instanceof AbstractFileSystemError) {
    return err;
  }
  let code = 0;
  let name = "";
  if (err) {
    const e = err as any;
    if (e.code) {
      code = e.code;
    }
    name = "";
    if (e.name) {
      name = e.name;
    }
    let message = "";
    if (e.message) {
      message = e.message;
    }
    console.debug(repository, path, code, name, message);
  }
  if (name) {
    switch (name) {
      case "NotFoundError":
        return new NotFoundError(repository, path, err);
      case "SecurityError":
        return new SecurityError(repository, path, err);
      case "AbortError":
        return new AbortError(repository, path, err);
      case "NotReadableError":
        return new NotReadableError(repository, path, err);
      case "EncodingError":
        return new EncodingError(repository, path, err);
      case "NoModificationAllowedError":
        return new NoModificationAllowedError(repository, path, err);
      case "InvalidStateError":
        return new InvalidStateError(repository, path, err);
      case "SyntaxError":
        return new SyntaxError(repository, path, err);
      case "InvalidModificationError":
        return new InvalidModificationError(repository, path, err);
      case "QuotaExceededError":
        return new QuotaExceededError(repository, path, err);
      case "TypeMismatchError":
        return new TypeMismatchError(repository, path, err);
      case "PathExistsError":
        return new PathExistsError(repository, path, err);
    }
  }
  if (code) {
    switch (code) {
      case 1: // NOT_FOUND_ERR
        return new NotFoundError(repository, path, err);
      case 2: // SECURITY_ERR
        return new SecurityError(repository, path, err);
      case 3: // ABORT_ERR:
        return new AbortError(repository, path, err);
      case 4: // NOT_READABLE_ERR:
        return new NotReadableError(repository, path, err);
      case 5: // ENCODING_ERR:
        return new EncodingError(repository, path, err);
      case 6: // NO_MODIFICATION_ALLOWED_ERR:
        return new NoModificationAllowedError(repository, path, err);
      case 7: // INVALID_STATE_ERR:
        return new InvalidStateError(repository, path, err);
      case 8: // SYNTAX_ERR:
        return new SyntaxError(repository, path, err);
      case 9: // INVALID_MODIFICATION_ERR:
        return new InvalidModificationError(repository, path, err);
      case 10: // QUOTA_EXCEEDED_ERR:
        return new QuotaExceededError(repository, path, err);
      case 11: // TYPE_MISMATCH_ERR:
        return new TypeMismatchError(repository, path, err);
      case 12: // PATH_EXISTS_ERR:
        return new PathExistsError(repository, path, err);
    }
  }
  return new NotSupportedError(repository, path, err);
}

const requestFileSystem =
  window.requestFileSystem || (window as any).webkitRequestFileSystem;
export class WebFileSystem extends AbstractFileSystem {
  private fs?: FileSystem;
  private rootDir: string;

  constructor(
    rootDir: string,
    private size: number,
    options?: FileSystemOptions
  ) {
    super(util.normalizePath(rootDir), options);
    this.rootDir = this.repository;
  }

  public async _getFS() {
    if (this.fs) {
      return this.fs;
    }
    if ((window as any).webkitStorageInfo) {
      await new Promise<void>((resolve, reject) => {
        const webkitStorageInfo = (window as any).webkitStorageInfo;
        webkitStorageInfo.requestQuota(
          window.PERSISTENT,
          this.size,
          () => resolve(),
          (e: any) => reject(convertError(this.repository, "", e))
        );
      });
    } else if ((navigator as any).webkitPersistentStorage) {
      await new Promise<void>((resolve, reject) => {
        const webkitPersistentStorage = (navigator as any)
          .webkitPersistentStorage;
        webkitPersistentStorage.requestQuota(
          this.size,
          () => resolve(),
          (e: any) => reject(convertError(this.repository, "", e))
        );
      });
    }
    const fs = await new Promise<FileSystem>((resolve, reject) => {
      requestFileSystem(
        window.PERSISTENT,
        this.size,
        (fs) => resolve(fs),
        (err) => reject(convertError(this.repository, "", err))
      );
    });
    await new Promise<void>((resolve, reject) => {
      fs.root.getDirectory(
        this.repository,
        { create: true },
        () => resolve(),
        (err) => reject(convertError(this.repository, "", err))
      );
    });
    this.fs = fs;
    return fs;
  }

  public async _head(path: string, _options: HeadOptions): Promise<Stats> {
    const entry = await this.getEntry(path);
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
        (err) => reject(convertError(this.repository, path, err))
      );
    });
  }

  public _patch(
    _path: string,
    _props: Props,
    _options: PatchOptions
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  public async getDirectory(path: string): Promise<Directory> {
    return new WebDirectory(this, path);
  }

  public async getFile(path: string): Promise<File> {
    return new WebFile(this, path);
  }

  public async toURL(path: string, urlType: URLType = "GET"): Promise<string> {
    if (urlType !== "GET") {
      throw new NotSupportedError(
        this.repository,
        path,
        `"${urlType}" is not supported`
      );
    }
    const entry = await this.getEntry(path);
    return entry.toURL();
  }

  private async getEntry(path: string) {
    const fs = await this._getFS();
    return new Promise<FileEntry | DirectoryEntry>((resolve, reject) => {
      let rejected: FileError;
      const handle = (err: FileError) => {
        if (rejected) reject(convertError(this.repository, path, rejected));
        rejected = err;
      };
      const fullPath = util.joinPaths(this.rootDir, path);
      fs.root.getFile(fullPath, { create: false }, resolve, handle);
      fs.root.getDirectory(fullPath, { create: false }, resolve, handle);
    });
  }
}
