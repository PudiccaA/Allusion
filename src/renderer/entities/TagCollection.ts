import { IReactionDisposer, observable, reaction, computed } from 'mobx';
import TagStore from '../frontend/stores/TagStore';
import { generateId, ID, IIdentifiable, ISerializable } from './ID';
import { ClientTag } from './Tag';

/* Generic properties of a Tag Collection in our application */
export interface ITagCollection extends IIdentifiable {
  id: ID;
  name: string;
  description: string;
  dateAdded: Date;
  subCollections: ID[];
  tags: ID[];
}

/* A Tag Collection as it is represented in the Database */
export class DbTagCollection implements ITagCollection {
  public id: ID;
  public name: string;
  public description: string;
  public dateAdded: Date;
  public subCollections: ID[];
  public tags: ID[];

  constructor(id: ID, name: string, description?: string) {
    this.id = id;
    this.name = name;
    this.description = description || '';
    this.dateAdded = new Date();
    this.subCollections = [];
    this.tags = [];
  }
}

/**
 * A Tag as it is stored in the Client.
 * It is stored in a MobX store, which can observe changed made to it and subsequently
 * update the entity in the backend.
 */
export class ClientTagCollection implements ITagCollection, ISerializable<DbTagCollection> {
  store: TagStore;
  saveHandler: IReactionDisposer;
  autoSave = true;

  id: ID;
  dateAdded: Date;
  @observable name: string;
  @observable description: string;
  readonly subCollections = observable<ID>([]);
  readonly tags = observable<ID>([]);

  constructor(store: TagStore, name?: string, id = generateId()) {
    this.store = store;
    this.id = id;
    this.name = name || '';
    this.description = '';
    this.dateAdded = new Date();

    // observe all changes to observable fields
    this.saveHandler = reaction(
      // We need to explicitly define which values this reaction should react to
      () => this.serialize(),
      // Then update the entity in the database
      (tag) => {
        if (this.autoSave) {
          this.store.backend.saveTag(tag);
        }
      },
    );
  }

  serialize(): ITagCollection {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      dateAdded: this.dateAdded,
      subCollections: this.subCollections.toJS(),
      tags: this.tags.toJS(),
    };
  }

  /** Get actual tag collection objects based on the IDs retrieved from the backend */
  @computed get clientSubCollections(): ClientTag[] {
    return this.subCollections.map(
      (id) => this.store.rootStore.tagStore.tagList.find((t) => t.id === id)) as ClientTag[];
  }

  /** Get actual tag objects based on the IDs retrieved from the backend */
  @computed get clientTags(): ClientTag[] {
    return this.tags.map((id) => this.store.rootStore.tagStore.tagList.find((t) => t.id === id)) as ClientTag[];
  }

  delete() {
    this.store.backend.removeTag(this);
    this.store.removeTag(this);
  }

  /**
   * Used for updating this Entity if changes are made to the backend outside of this session of the application.
   * @param backendTagCollection The file received from the backend
   */
  updateFromBackend(backendTagCollection: ITagCollection): ClientTag {
    // make sure our changes aren't sent back to the backend
    this.autoSave = false;

    this.id = backendTagCollection.id;
    this.name = backendTagCollection.name;
    this.description = backendTagCollection.description;
    this.dateAdded = backendTagCollection.dateAdded;
    this.subCollections.push(...backendTagCollection.subCollections);
    this.tags.push(...backendTagCollection.tags);

    this.autoSave = true;

    return this;
  }

  dispose() {
    // clean up the observer
    this.saveHandler();
  }
}
