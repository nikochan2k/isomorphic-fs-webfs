import { AbstractDirectory, createError, ErrorLike, joinPaths } from "univ-fs";
import { WfsFileSystem } from "./WfsFileSystem";

export class WfsDirectory extends AbstractDirectory {
  constructor(private wfs: WfsFileSystem, path: string) {
    super(wfs, path);
  }

  public async _list(): Promise<string[]> {
    const wfs = this.wfs;
    const path = this.path;
    const repository = wfs.repository;
    const fullPath = joinPaths(repository, path);

    const fs = await wfs._getFS();
    return new Promise<string[]>((resolve, reject) => {
      fs.root.getDirectory(
        fullPath,
        { create: false },
        (directory) => {
          const reader = directory.createReader();
          reader.readEntries(
            (entries) => {
              const list: string[] = [];
              const from = repository.length;
              for (const entry of entries) {
                list.push(entry.fullPath.substr(from));
              }
              resolve(list);
            },
            (e) => reject(createError({ repository, path, e: e as ErrorLike }))
          );
        },
        (e) => reject(createError({ repository, path, e: e as ErrorLike }))
      );
    });
  }

  public async _mkcol(): Promise<void> {
    const wfs = this.wfs;
    const path = this.path;
    const repository = wfs.repository;
    const fullPath = joinPaths(repository, path);

    const fs = await wfs._getFS();
    return new Promise<void>((resolve, reject) => {
      fs.root.getDirectory(
        fullPath,
        { create: true },
        () => resolve(),
        (e) => reject(createError({ repository, path, e: e as ErrorLike }))
      );
    });
  }

  public async _rmdir(): Promise<void> {
    const wfs = this.wfs;
    const path = this.path;
    const repository = wfs.repository;
    const fullPath = joinPaths(repository, path);

    const fs = await this.wfs._getFS();
    return new Promise<void>((resolve, reject) => {
      fs.root.getDirectory(
        fullPath,
        { create: false },
        (entry) => {
          const handle = (e: FileError) =>
            reject(createError({ repository, path, e: e as ErrorLike }));
          entry.remove(resolve, handle);
        },
        (e) => reject(createError({ repository, path, e: e as ErrorLike }))
      );
    });
  }
}
