import React, { useState, useEffect, useCallback } from 'react';
import { ResizeSensor, IResizeEntry } from '@blueprintjs/core';
import { FixedSizeGrid, GridItemKeySelector, FixedSizeList, ListItemKeySelector } from 'react-window';
import { observer, Observer } from 'mobx-react-lite';

import { withRootstore, IRootStoreProp } from '../contexts/StoreContext';
import GalleryItem from './GalleryItem';
import UiStore, { ViewMethod } from '../stores/UiStore';
import { ClientFile } from '../../entities/File';

const cellSize = 260; // Should be same as CSS variable $thumbnail-size + padding

interface IGalleryLayoutProps {
  contentWidth: number;
  contentHeight: number;
  fileList: ClientFile[];
  uiStore: UiStore;
  onSelect: (i: number, e: React.MouseEvent) => void;
}

function getLayoutComponent(viewMethod: ViewMethod, props: IGalleryLayoutProps) {
  switch (viewMethod) {
    case 'grid':
      return <GridGallery {...props} />;
    case 'mason':
      return <MasonryGallery {...props}  />;
    case 'list':
      return <ListGallery {...props}  />;
    case 'slide':
      return <SlideGallery {...props}  />;
    default:
      return null;
  }
}

const GridGallery = observer(
  ({ contentWidth, contentHeight, fileList, uiStore, onSelect }: IGalleryLayoutProps) => {
  const numColumns = Math.floor(contentWidth / cellSize);
  const numRows = Math.ceil(fileList.length / numColumns);

  /** Generates a unique key for an element in the grid */
  const handleItemKey: GridItemKeySelector = useCallback(
    ({ columnIndex, rowIndex }) => {
      const itemIndex = rowIndex * numColumns + columnIndex;
      const file = itemIndex < fileList.length ? fileList[itemIndex] : null;
      return `${rowIndex}-${columnIndex}-${file ? file.id : ''}`;
  }, []);

  const Cell = useCallback(
    ({ columnIndex, rowIndex, style }) => {
      const itemIndex = rowIndex * numColumns + columnIndex;
      const file = itemIndex < fileList.length ? fileList[itemIndex] : null;
      if (!file) {
        return <div />;
      }
      return (
        <div style={style}>
          {/* Item {itemIndex} ({rowIndex},{columnIndex}) */}
          {/* <img src={file.path} width={colWidth} height={colWidth} /> */}
          {/* <img src={`https://placekitten.com/${colWidth}/${colWidth}`} width={colWidth} height={colWidth} /> */}
          <Observer>
            {() => (
              <GalleryItem
                key={`file-${file.id}`}
                file={file}
                isSelected={uiStore.fileSelection.includes(file.id)}
                onRemoveTag={(tag) => file.removeTag(tag.id)}
                onSelect={(f, e) => onSelect(itemIndex, e)}
                onDeselect={(f) => uiStore.deselectFile(f)}
                onDrop={(tag) => file.addTag(tag.id)}

              />
            )}
          </Observer>
        </div>
      );
    },
    [numColumns],
  );
  return (
    <FixedSizeGrid
      columnCount={numColumns}
      columnWidth={cellSize}
      height={contentHeight}
      rowCount={numRows}
      rowHeight={cellSize}
      width={contentWidth}
      itemData={fileList}
      itemKey={handleItemKey}
      overscanRowsCount={2}
      children={Cell}
    />
  );
});

const ListGallery = observer(
  ({ contentWidth, contentHeight, fileList, uiStore, onSelect }: IGalleryLayoutProps) => {
  /** Generates a unique key for an element in the grid */
  const handleItemKey: ListItemKeySelector = useCallback(
    (index) => {
      const file = index < fileList.length ? fileList[index] : null;
      return `${index}-${file ? file.id : ''}`;
  }, []);

  const Row = useCallback(
    ({ index, style }) => {
      const file = index < fileList.length ? fileList[index] : null;
      if (!file) {
        return <div />;
      }
      return (
        <div style={style}>
          <Observer>
            {() => (
              <GalleryItem
                key={`file-${file.id}`}
                file={file}
                isSelected={uiStore.fileSelection.includes(file.id)}
                onRemoveTag={(tag) => file.removeTag(tag.id)}
                onSelect={(f, e) => onSelect(index, e)}
                onDeselect={(f) => uiStore.deselectFile(f)}
                onDrop={(tag) => file.addTag(tag.id)}
                showInfo
                showName
                showTags
              />
            )}
          </Observer>
        </div>
      );
    },
    [],
  );
  return (
    <FixedSizeList
      height={contentHeight}
      width={contentWidth}
      itemSize={cellSize}
      itemCount={fileList.length}
      itemKey={handleItemKey}
      overscanCount={2}
      children={Row}
    />
  );
});

const MasonryGallery = observer(({ contentWidth, contentHeight, fileList, uiStore, onSelect }: IGalleryLayoutProps) => {
  return null;
});

const SlideGallery = observer(({ contentWidth, contentHeight, fileList, uiStore, onSelect }: IGalleryLayoutProps) => {
  return null;
});

interface IGalleryProps extends IRootStoreProp {}

const Gallery = ({
  rootStore: {
    uiStore,
    fileStore: { fileList },
  },
}: IGalleryProps) => {
  const [contentHeight, setContentHeight] = useState(1); // window.innerWidth
  const [contentWidth, setContentWidth] = useState(1); // window.innerWidth
  const handleResize = useCallback((entries: IResizeEntry[]) => {
    setContentWidth(entries[0].contentRect.width);
    setContentHeight(entries[0].contentRect.height);
  }, []);

  // Todo: Maybe move these to UiStore so that it can be reset when the fileList changes?
  /** The first item that is selected in a multi-selection */
  const [initialSelectionIndex, setInitialSelectionIndex] = useState<
    number | undefined
  >(undefined);
  /** The last item that is selected in a multi-selection */
  const [lastSelectionIndex, setLastSelectionIndex] = useState<
    number | undefined
  >(undefined);

  const selectionModeOn = uiStore.fileSelection.length > 0;
  const onSelect = (i: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Shift selection: Select from the initial up to the current index
      if (initialSelectionIndex !== undefined) {
        uiStore.fileSelection.clear();
        // Make sure that sliceStart is the lowest index of the two and vice versa
        let sliceStart = initialSelectionIndex;
        let sliceEnd = i;
        if (i < initialSelectionIndex) {
          sliceStart = i;
          sliceEnd = initialSelectionIndex;
        }
        uiStore.fileSelection.push(...fileList.slice(sliceStart, sliceEnd + 1)
          .map((f) => f.id));
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/meta selection: Add this file to selection
      setInitialSelectionIndex(i);
      uiStore.fileSelection.push(fileList[i].id);
    } else {
      // Normal selection: Only select this file
      setInitialSelectionIndex(i);
      uiStore.fileSelection.clear();
      uiStore.fileSelection.push(fileList[i].id);
    }
    setLastSelectionIndex(i);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // When an arrow key is pressed, select the item relative to the last selected item
    // Fixme: For some reason, the state is not updated here (lastSelectionIndex is always undefined)
    // console.log(e, lastSelectionIndex);
    if (lastSelectionIndex === undefined) {
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      uiStore.fileSelection.clear();
      uiStore.selectFile(fileList[Math.max(0, lastSelectionIndex - 1)]);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      uiStore.fileSelection.clear();
      uiStore.selectFile(
        fileList[Math.min(fileList.length - 1, lastSelectionIndex + 1)],
      );
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <ResizeSensor onResize={handleResize}>
      <div className={`gallery-content ${uiStore.viewMethod} ${selectionModeOn ? 'gallerySelectionMode' : ''}`}>
          {getLayoutComponent(uiStore.viewMethod, { contentWidth, contentHeight, fileList, uiStore, onSelect })}
      </div>
    </ResizeSensor>
  );
};

export default withRootstore(observer(Gallery));
