import { autorun } from 'mobx';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClientLocation, ClientSubLocation } from 'src/entities/Location';
import { useStore } from 'src/frontend/contexts/StoreContext';
import { Button } from 'widgets';
import { Checkbox } from 'widgets/Checkbox';
import { IconSet } from 'widgets/Icons';
import { Dialog } from 'widgets/popovers';
import Tree, { ITreeItem } from 'widgets/Tree';
import { IExpansionState } from '../../types';

interface ITreeData {
  expansion: IExpansionState;
  setExpansion: React.Dispatch<IExpansionState>;
}

const isExpanded = (nodeData: ClientLocation | ClientSubLocation, treeData: ITreeData) =>
  treeData.expansion[nodeData instanceof ClientLocation ? nodeData.id : nodeData.path];

const toggleExpansion = (nodeData: ClientLocation | ClientSubLocation, treeData: ITreeData) => {
  const { expansion, setExpansion } = treeData;
  if (nodeData instanceof ClientLocation) {
    setExpansion({ ...expansion, [nodeData.id]: !expansion[nodeData.id] });
  } else if (!nodeData.isExcluded) {
    setExpansion({ ...expansion, [nodeData.path]: !expansion[nodeData.path] });
  }
};

const SubLocationLabel = (nodeData: ClientSubLocation, treeData: ITreeData) => (
  <SubLocation nodeData={nodeData} treeData={treeData} />
);

const mapDirectory = (dir: ClientSubLocation): ITreeItem => ({
  id: dir.path,
  label: SubLocationLabel,
  nodeData: dir,
  children: dir.subLocations.map(mapDirectory),
  isExpanded,
});

const LocationLabel = (nodeData: any, treeData: any) => (
  <Location nodeData={nodeData} treeData={treeData} />
);

const SubLocation = ({
  nodeData,
  treeData,
}: {
  nodeData: ClientSubLocation;
  treeData: ITreeData;
}) => {
  const { expansion, setExpansion } = treeData;
  const subLocation = nodeData;

  const toggleExclusion = () => {
    subLocation.toggleExcluded();
    // Need to update expansion to force a rerender of the tree
    setExpansion({ ...expansion, [subLocation.path]: false });
  };

  return (
    <div className="tree-content-label" aria-disabled={subLocation.isExcluded}>
      <Checkbox
        // label looks nicer on the right
        label=""
        onChange={toggleExclusion}
        // make it appear like it's an "include" option
        checked={!subLocation.isExcluded}
      />
      <span
        style={{
          marginLeft: '4px',
          color: subLocation.isExcluded ? 'var(--text-color-muted)' : undefined,
        }}
      >
        {subLocation.name}
      </span>
    </div>
  );
};

const Location = ({ nodeData }: { nodeData: ClientLocation; treeData: ITreeData }) => {
  return (
    <div className="tree-content-label">
      <div>{nodeData.name}</div>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
const emptyFunction = () => {};

const SubLocationInclusionTree = ({ location }: { location: ClientLocation }) => {
  const [expansion, setExpansion] = useState<IExpansionState>({ [location.id]: true });
  const treeData: ITreeData = useMemo<ITreeData>(
    () => ({
      expansion,
      setExpansion,
    }),
    [expansion],
  );
  const [branches, setBranches] = useState<ITreeItem[]>([]);

  useEffect(
    () =>
      autorun(() =>
        setBranches([
          {
            id: location.id,
            label: LocationLabel,
            children: location.subLocations.map(mapDirectory),
            nodeData: location,
            isExpanded,
          },
        ]),
      ),
    [location],
  );

  return (
    <Tree
      id="new-location"
      multiSelect
      children={branches}
      treeData={treeData}
      toggleExpansion={toggleExpansion}
      onBranchKeyDown={emptyFunction}
      onLeafKeyDown={emptyFunction}
    />
  );
};

interface LocationCreationDialogProps {
  /** A new, un-initialized ClientLocation */
  location: ClientLocation;
  onClose: () => void;
}

const LocationCreationDialog = ({ location, onClose }: LocationCreationDialogProps) => {
  const { locationStore } = useStore();
  const [sublocationsLoaded, setSublocationsLoaded] = useState(false);
  // const [importFolderHierarchyAsTags, setImportFolderHierarchyAsTags] = useState(false);

  const handleSubmit = useCallback(
    () => locationStore.initLocation(location).catch(console.error),
    [location, locationStore],
  );

  const handleClose = useCallback(() => {
    location.delete().catch(console.error);
    onClose();
  }, [location, onClose]);

  useEffect(() => {
    return autorun(() => {
      if (location.subLocations.length === 0 && !location.isInitialized) {
        location.refreshSublocations().then(() => setSublocationsLoaded(true));
      }
    });
  }, [location]);

  return (
    <Dialog
      open
      title={`Add Location ${location.name}`}
      icon={IconSet.FOLDER_CLOSE}
      describedby="location-add-info"
      onClose={handleClose}
    >
      <p id="location-add-info">
        You can configure the location {location.name} by including only certain subdirectories from
        the directory.
        {/* TODO: Switch for importing folder structure as tags */}
        {/* <p>Would you like to create tags from the folder structure of this Location?</p>
        <div style={{ marginLeft: '1rem' }}>
          <Checkbox
            label="Create tags from folder structure"
            onChange={(e) => setImportFolderHierarchyAsTags(Boolean(e.target.checked))}
            checked={importFolderHierarchyAsTags}
          />
        </div> */}
        {/* Show folder, exclude directories */}
      </p>
      <form method="dialog" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Included Subdirectories of {location.name}</legend>
          {!sublocationsLoaded ? (
            <i>{IconSet.LOADING} loading...</i>
          ) : (
            <SubLocationInclusionTree location={location} />
          )}
        </fieldset>

        <fieldset className="dialog-actions">
          <Button type="submit" styling="filled" text="Confirm" />
          <Button styling="outlined" onClick={handleClose} text="Cancel" />
        </fieldset>
      </form>
    </Dialog>
  );
};

export default LocationCreationDialog;