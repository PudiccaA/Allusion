import fse from 'fs-extra';
import { action, computed, makeObservable, observable, observe, runInAction } from 'mobx';
import Backend from 'src/backend/Backend';
import { FileOrder } from 'src/backend/DBRepository';
import { ClientFile, IFile } from 'src/entities/File';
import { ID } from 'src/entities/ID';
import { ClientLocation } from 'src/entities/Location';
import { ClientTagSearchCriteria, SearchCriteria } from 'src/entities/SearchCriteria';
import { ClientTag } from 'src/entities/Tag';
import { debounce, getThumbnailPath, needsThumbnail, promiseAllLimit } from '../utils';
import RootStore from './RootStore';

const FILE_STORAGE_KEY = 'Allusion_File';

/** These fields are stored and recovered when the application opens up */
const PersistentPreferenceFields: Array<keyof FileStore> = ['fileOrder', 'orderBy'];

class FileStore {
  private readonly backend: Backend;
  private readonly rootStore: RootStore;

  readonly fileList = observable<ClientFile>([]);
  /**
   * The timestamp when the fileList was last modified.
   * Useful for in react component dependencies that need to trigger logic when the fileList changes
   */
  fileListLastModified = observable<Date>(new Date());
  /** A map of file ID to its index in the file list, for quick lookups by ID */
  private readonly index = new Map<ID, number>();

  @observable fileOrder: FileOrder = FileOrder.Desc;
  @observable orderBy: keyof IFile = 'dateAdded';
  @observable numTotalFiles = 0;
  @observable numUntaggedFiles = 0;
  @observable numMissingFiles = 0;
  readonly selection = observable(new Set<Readonly<ClientFile>>());

  constructor(backend: Backend, rootStore: RootStore) {
    this.backend = backend;
    this.rootStore = rootStore;
    makeObservable(this);

    // Store preferences immediately when anything is changed
    const debouncedPersist = debounce(this.storePersistentPreferences, 200).bind(this);
    PersistentPreferenceFields.forEach((f) => observe(this, f, debouncedPersist));
  }

  @action switchFileOrder() {
    this.setFileOrder(this.fileOrder === FileOrder.Desc ? FileOrder.Asc : FileOrder.Desc);
  }

  @action orderFilesBy(prop: keyof IFile = 'dateAdded') {
    this.setOrderBy(prop);
  }

  /**
   * Marks file as missing
   *
   * Marking a file as missing will remove the file from the FileStore stats and
   * automatically 'freezes' the object. Freezing means that changes made to a
   * file will not be saved in the database.
   * @param file
   */
  @action.bound hideFile(file: ClientFile) {
    file.setBroken(true);
    this.deselect(file);
    this.incrementNumMissingFiles();
    if (file.tags.size === 0) {
      this.decrementNumUntaggedFiles();
    }
  }

  @action async delete(files: readonly Readonly<ClientFile>[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    try {
      // Remove from backend
      // Deleting non-exiting keys should not throw an error!
      await this.backend.removeFiles(files.map((f) => f.id));

      // Remove files from stores
      for (const file of files) {
        this.deselect(file);
        this.removeThumbnail(file.absolutePath);
      }
    } catch (err) {
      console.error('Could not remove files', err);
    }
  }

  @action async fetchAllFiles() {
    try {
      const fetchedFiles = await this.backend.fetchFiles(this.orderBy, this.fileOrder);
      return this.updateFromBackend(fetchedFiles);
    } catch (err) {
      console.error('Could not load all files', err);
    }
  }

  @action async fetchMissingFiles(): Promise<string> {
    try {
      const { orderBy, fileOrder } = this;

      // Fetch all files, then check their existence and only show the missing ones
      // Similar to {@link updateFromBackend}, but the existence check needs to be awaited before we can show the images
      const backendFiles = await this.backend.fetchFiles(orderBy, fileOrder);

      // For every new file coming in, either re-use the existing client file if it exists,
      // or construct a new client file
      const [newClientFiles, reusedStatus] = this.filesFromBackend(backendFiles);

      // Dispose of unused files
      runInAction(() => {
        for (const oldFile of this.fileList) {
          if (!reusedStatus.has(oldFile.id)) {
            oldFile.dispose();
          }
        }
      });

      // We don't store whether files are missing (since they might change at any time)
      // So we have to check all files and check their existence them here
      const existenceCheckPromises = newClientFiles.map((clientFile) => async () => {
        clientFile.setBroken(!(await fse.pathExists(clientFile.absolutePath)));
      });

      const N = 50; // TODO: same here as in fetchFromBackend: number of concurrent checks should be system dependent
      await promiseAllLimit(existenceCheckPromises, N);

      runInAction(() => {
        const missingClientFiles = newClientFiles.filter((file) => file.isBroken);
        this.fileList.replace(missingClientFiles);
        this.numMissingFiles = missingClientFiles.length;
        this.index.clear();
        for (let index = 0; index < this.fileList.length; index++) {
          const file = this.fileList[index];
          this.index.set(file.id, index);
        }
        this.fileListLastModified = new Date();
      });
      this.cleanFileSelection();
      return 'Some files can no longer be found. Either move them back to their location, or delete them from Allusion';
    } catch (err) {
      return `Could not load broken files: ${err}`;
    }
  }

  @action async fetchFilesByQuery(
    criteria: SearchCriteria<IFile> | SearchCriteria<IFile>[],
    searchMatchAny: boolean,
  ) {
    if (Array.isArray(criteria) && criteria.length === 0) {
      return this.fetchAllFiles();
    }
    try {
      const fetchedFiles = await this.backend.searchFiles(
        criteria as any,
        this.orderBy,
        this.fileOrder,
        searchMatchAny,
      );
      return this.updateFromBackend(fetchedFiles);
    } catch (e) {
      console.log('Could not find files based on criteria', e);
    }
  }

  @action.bound async fetchFilesByIDs(files: ID[]) {
    try {
      const fetchedFiles = await this.backend.fetchFilesByID(files);
      return this.updateFromBackend(fetchedFiles);
    } catch (e) {
      console.log('Could not find files based on IDs', e);
    }
  }

  @action.bound incrementNumUntaggedFiles() {
    this.numUntaggedFiles++;
  }

  @action.bound decrementNumUntaggedFiles() {
    if (this.numUntaggedFiles === 0) {
      throw new Error('Invalid Database State: Cannot have less than 0 untagged files.');
    }
    this.numUntaggedFiles--;
  }

  // Removes all items from fileList
  @action clearFileList() {
    this.deselectAll();
    this.index.clear();
    this.fileList.clear();
  }

  @action get(id: ID): ClientFile | undefined {
    const fileIndex = this.index.get(id);
    return fileIndex !== undefined ? this.fileList[fileIndex] : undefined;
  }

  getIndex(id: ID): number | undefined {
    return this.index.get(id);
  }

  getTags(ids: ID[]): Set<ClientTag> {
    const { tagStore } = this.rootStore;
    const tags = new Set<ClientTag>();
    for (const id of ids) {
      const tag = tagStore.get(id);
      if (tag !== undefined) {
        tags.add(tag);
      }
    }
    return tags;
  }

  getLocation(location: ID): ClientLocation {
    const loc = this.rootStore.locationStore.get(location);
    if (!loc) {
      throw new Error(
        `Location of file was not found! This should never happen! Location ${location}`,
      );
    }
    return loc;
  }

  save(file: IFile) {
    file.dateModified = new Date();
    this.backend.saveFile(file);
  }

  @computed get firstSelectedFile(): Readonly<ClientFile> | undefined {
    for (const file of this.selection) {
      return file;
    }
    return undefined;
  }

  @action select(file: Readonly<ClientFile>, clear?: boolean) {
    if (clear === true) {
      this.deselectAll();
    }
    this.selection.add(file);
    return this.getIndex(file.id);
  }

  @action deselect(file: Readonly<ClientFile>) {
    this.selection.delete(file);
  }

  @action toggleSelection(file: Readonly<ClientFile>, clear?: boolean) {
    if (this.selection.has(file)) {
      this.selection.delete(file);
    } else {
      if (clear) {
        this.selection.clear();
      }
      this.selection.add(file);
    }
  }

  @action selectRange(start: number, end: number, additive?: boolean) {
    if (!additive) {
      this.selection.clear();
    }
    for (let i = start; i <= end; i++) {
      this.selection.add(this.fileList[i]);
    }
  }

  @action.bound selectAll() {
    this.selection.replace(this.fileList);
  }

  @action.bound deselectAll() {
    this.selection.clear();
  }

  @action recoverPersistentPreferences() {
    const prefsString = localStorage.getItem(FILE_STORAGE_KEY);
    if (prefsString) {
      try {
        const prefs = JSON.parse(prefsString);
        this.setFileOrder(prefs.fileOrder);
        this.setOrderBy(prefs.orderBy);
      } catch (e) {
        console.log('Cannot parse persistent preferences:', FILE_STORAGE_KEY, e);
      }
    }
  }

  @action storePersistentPreferences() {
    const prefs: any = {};
    for (const field of PersistentPreferenceFields) {
      prefs[field] = this[field];
    }
    localStorage.setItem(FILE_STORAGE_KEY, JSON.stringify(prefs));
  }

  @action private async removeThumbnail(path: string) {
    const thumbnailPath = getThumbnailPath(path, this.rootStore.uiStore.thumbnailDirectory);
    try {
      if (await fse.pathExists(thumbnailPath)) {
        return fse.remove(thumbnailPath);
      }
    } catch (error) {
      // TODO: Show a notification that not all thumbnails could be removed?
      console.error(error);
    }
  }

  @action private async updateFromBackend(backendFiles: IFile[]): Promise<void> {
    if (backendFiles.length === 0) {
      this.deselectAll();
      this.fileListLastModified = new Date();
      return this.clearFileList();
    }

    // For every new file coming in, either re-use the existing client file if it exists,
    // or construct a new client file
    const [newClientFiles, reusedStatus] = this.filesFromBackend(backendFiles);

    // Dispose of Client files that are not re-used
    for (const file of this.fileList) {
      if (!reusedStatus.has(file.id)) {
        file.dispose();
      }
    }

    // Check existence of new files asynchronously, no need to wait until they can be showed
    // we can simply check whether they exist after they start rendering
    const existenceCheckPromises = newClientFiles.map((clientFile) => async () => {
      clientFile.setBroken(!(await fse.pathExists(clientFile.absolutePath)));
    });

    // Run the existence check with at most N checks in parallel
    // TODO: Should make N configurable, or determine based on the system/disk performance
    // NOTE: This is _not_ await intentionally, since we want to show the files to the user as soon as possible
    runInAction(() => {
      this.fileList.replace(newClientFiles);
      this.cleanFileSelection();
      this.updateFileListState(); // update index & untagged image counter
      this.fileListLastModified = new Date();
    });
    const N = 50;
    return promiseAllLimit(existenceCheckPromises, N)
      .then(() => {
        this.updateFileListState(); // update missing image counter
      })
      .catch((e) => console.error('An error occured during existence checking!', e));
  }

  /** Remove files from selection that are not in the file list anymore */
  @action private cleanFileSelection() {
    for (const file of this.selection) {
      if (!this.index.has(file.id)) {
        this.selection.delete(file);
      }
    }
  }

  /**
   *
   * @param backendFiles
   * @returns A list of Client files, and a set of keys that was reused from the existing fileList
   */
  @action private filesFromBackend(backendFiles: IFile[]): [ClientFile[], Set<ID>] {
    const reusedStatus = new Set<ID>();

    const clientFiles = backendFiles.map((f) => {
      // Might already exist!
      const existingFile = this.get(f.id);
      if (existingFile !== undefined) {
        reusedStatus.add(existingFile.id);
        // Update tags (might have changes, e.g. removed/merged)
        const newTags = f.tags.map((t) => this.rootStore.tagStore.get(t));
        if (
          existingFile.tags.size !== f.tags.length ||
          Array.from(existingFile.tags).some((t, i) => t?.id !== f.tags[i])
        ) {
          existingFile.updateTagsFromBackend(newTags as ClientTag[]);
        }
        return existingFile;
      }

      // Otherwise, create new one.
      // TODO: Maybe better performance by always keeping the same pool of client files,
      // and just replacing their properties instead of creating new objects
      // But that's micro optimization...

      const file = new ClientFile(this, f);
      // Initialize the thumbnail path so the image can be loaded immediately when it mounts.
      // To ensure the thumbnail actually exists, the `ensureThumbnail` function should be called
      file.thumbnailPath = needsThumbnail(f.width, f.height)
        ? getThumbnailPath(f.absolutePath, this.rootStore.uiStore.thumbnailDirectory)
        : f.absolutePath;
      return file;
    });

    return [clientFiles, reusedStatus];
  }

  /** Derive fields from `fileList`
   * - `index`
   * - `numUntaggedFiles`
   * - `numMissingFiles`
   */
  @action private updateFileListState() {
    let missingFiles = 0;
    let untaggedFiles = 0;
    this.index.clear();
    for (let index = 0; index < this.fileList.length; index++) {
      const file = this.fileList[index];
      if (file.isBroken) {
        missingFiles += 1;
      } else if (file.tags.size === 0) {
        untaggedFiles += 1;
      }
      this.index.set(file.id, index);
    }
    this.numMissingFiles = missingFiles;
    if (this.rootStore.uiStore.showsAllContent) {
      this.numTotalFiles = this.fileList.length;
      this.numUntaggedFiles = untaggedFiles;
    } else if (this.rootStore.uiStore.showsUntaggedContent) {
      this.numUntaggedFiles = this.fileList.length;
    }
  }

  /** Initializes the total and untagged file counters by querying the database with count operations */
  async refetchFileCounts() {
    const noTagsCriteria = new ClientTagSearchCriteria(this.rootStore.tagStore, 'tags').serialize();
    const numUntaggedFiles = await this.backend.countFiles(noTagsCriteria);
    const numTotalFiles = await this.backend.countFiles();
    runInAction(() => {
      this.numUntaggedFiles = numUntaggedFiles;
      this.numTotalFiles = numTotalFiles;
    });
  }

  @action private setFileOrder(order: FileOrder = FileOrder.Desc) {
    this.fileOrder = order;
  }

  @action private setOrderBy(prop: keyof IFile = 'dateAdded') {
    this.orderBy = prop;
  }

  @action private incrementNumMissingFiles() {
    this.numMissingFiles++;
  }
}

export default FileStore;
