import { action, ObservableSet } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ClientFile } from 'src/entities/File';
import { ClientTag } from 'src/entities/Tag';
import TagStore from 'src/frontend/stores/TagStore';
import UiStore from 'src/frontend/stores/UiStore';
import { debounce } from 'src/frontend/utils';
import { Option, Tag } from 'widgets';
import { ControlledListbox, controlledListBoxKeyDown } from 'widgets/Combobox/ControlledListBox';
import { IconSet } from 'widgets/Icons';
import { MenuDivider, ToolbarButton } from 'widgets/menus';
import StoreContext from '../../contexts/StoreContext';
import { Tooltip } from './PrimaryCommands';

function countFileTags(files: ObservableSet<ClientFile>) {
  // Count how often tags are used
  const counter = new Map<ClientTag, number>();
  for (const file of files) {
    for (const tag of file.tags) {
      const count = counter.get(tag);
      counter.set(tag, count !== undefined ? count + 1 : 1);
    }
  }

  const sortedTags = Array.from(counter.entries())
    // Sort based on count
    .sort((a, b) => b[1] - a[1])
    .map((pair) => pair[0]);

  return { counter, sortedTags };
}

const TagFilesPopover = observer(() => {
  const { uiStore, tagStore } = useContext(StoreContext);

  return (
    <>
      <ToolbarButton
        showLabel="never"
        icon={IconSet.TAG_LINE}
        disabled={uiStore.fileSelection.size === 0 && !uiStore.isToolbarTagPopoverOpen}
        onClick={uiStore.toggleToolbarTagPopover}
        text="Tag selected files"
        tooltip={Tooltip.TagFiles}
      />
      <FloatingDialog
        isOpen={uiStore.isToolbarTagPopoverOpen}
        onClose={uiStore.closeToolbarTagPopover}
      >
        <TagFilesWidget uiStore={uiStore} tagStore={tagStore} />
      </FloatingDialog>
    </>
  );
});

export default TagFilesPopover;

interface TagFilesWidgetProps {
  uiStore: UiStore;
  tagStore: TagStore;
}

const TagFilesWidget = observer(({ uiStore, tagStore }: TagFilesWidgetProps) => {
  const [inputText, setInputText] = useState('');

  const { counter, sortedTags } = countFileTags(uiStore.fileSelection);
  const [matchingTags, setMatchingTags] = useState(tagStore.tagList);

  const inputRef = useRef<HTMLInputElement>(null);

  const [onSelect, onDeselect] = useRef([
    action((tag: ClientTag) => {
      for (const f of uiStore.fileSelection) {
        f.addTag(tag);
      }
    }),
    action((tag: ClientTag) => {
      for (const f of uiStore.fileSelection) {
        f.removeTag(tag);
      }
    }),
  ]).current;

  const handleInput = useRef(
    action((e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setInputText(e.target.value);

      if (text.length === 0) {
        setMatchingTags(tagStore.tagList);
      } else {
        const textLower = text.toLowerCase();
        const newTagList = tagStore.tagList.filter((t) => t.name.toLowerCase().includes(textLower));
        setMatchingTags(newTagList);
      }
    }),
  ).current;

  const options = useMemo(
    () =>
      matchingTags.map((t) => {
        const selected = counter.get(t) !== undefined;
        return {
          id: t.id,
          value: t.name,
          selected,
          icon: <span style={{ color: t.viewColor }}>{IconSet.TAG}</span>,
          onClick: () => {
            selected ? onDeselect(t) : onSelect(t);
            setInputText('');
            setMatchingTags(tagStore.tagList);
            inputRef.current?.focus();
          },
        };
      }),
    [counter, matchingTags, onDeselect, onSelect, tagStore],
  );

  // Todo: clamp this value when list size changes
  const [focusedOption, setFocusedOption] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const handleInputKeyDown = action((e: React.KeyboardEvent<HTMLInputElement>) => {
    controlledListBoxKeyDown(e, listRef, setFocusedOption, focusedOption);
  });

  // Remember the height when panel is resized
  const panelRef = useRef<HTMLDivElement>(null);
  const [storedHeight] = useState(localStorage.getItem('tag-editor-height'));
  useEffect(() => {
    if (!panelRef.current) return;
    const storeHeight = debounce((val: string) => localStorage.setItem('tag-editor-height', val));
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type == 'attributes' &&
          mutation.attributeName === 'style' &&
          panelRef.current
        ) {
          storeHeight(panelRef.current.style.height);
        }
      });
    });
    observer.observe(panelRef.current, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const createOption = [];
  if (inputText.length > 0) {
    let i = options.length;
    if (matchingTags.length !== 0) {
      i += 1;
      createOption.push(<MenuDivider key="divider" />);
    }
    createOption.push(
      <Option
        key="create"
        selected={false}
        value={`Create Tag "${inputText}"`}
        onClick={async () => {
          const tagList = tagStore.tagList;
          const newTag = await tagStore.create(tagStore.root, inputText);
          setInputText('');
          setMatchingTags(tagList);
          onSelect(newTag);
          inputRef.current?.focus();
        }}
        icon={IconSet.TAG_ADD}
        focused={focusedOption === i}
      />,
    );
  }

  return (
    <div
      id="tag-editor"
      onKeyDown={handleKeyDown}
      ref={panelRef}
      style={{ height: storedHeight || undefined }}
    >
      <input
        autoFocus
        type="text"
        value={inputText}
        aria-autocomplete="list"
        onChange={handleInput}
        onKeyDown={handleInputKeyDown}
        className="input"
        aria-controls="tag-files-listbox"
        ref={inputRef}
      />
      <ControlledListbox id="tag-files-listbox" multiselectable={true} listRef={listRef}>
        {options.map(({ id, ...optionProps }, i) => (
          <Option key={id} {...optionProps} focused={focusedOption === i} />
        ))}
        {createOption}
      </ControlledListbox>
      <div>
        {sortedTags.map((t) => (
          <Tag
            key={t.id}
            text={`${t.name}${uiStore.fileSelection.size > 1 ? ` (${counter.get(t)})` : ''}`}
            color={t.viewColor}
            onRemove={() => {
              onDeselect(t);
              inputRef.current?.focus();
            }}
          />
        ))}
        {sortedTags.length === 0 && <i>No tags added yet</i>}
      </div>
    </div>
  );
});

interface FloatingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

const FloatingDialog = (props: FloatingDialogProps) => {
  const { onClose, isOpen, children } = props;

  const handleBlur = (e: React.FocusEvent) => {
    const button = e.currentTarget.previousElementSibling as HTMLElement;
    if (e.relatedTarget !== button && !e.currentTarget.contains(e.relatedTarget as Node)) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    // FIXME: data attributes placeholder
    <div
      data-popover
      data-open={isOpen}
      className="floating-dialog"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      {isOpen ? children : null}
    </div>
  );
};

function handleKeyDown(e: React.KeyboardEvent) {
  const input = e.currentTarget.firstElementChild as HTMLElement;
  const listbox = input.nextElementSibling as HTMLElement;

  switch (e.key) {
    case 'ArrowDown':
      if (listbox.firstElementChild !== null) {
        e.preventDefault(); // FIXME: element.focus({ preventScroll: true}) option not working (Chrome Bug)
        e.stopPropagation();
        (listbox.firstElementChild as HTMLElement).focus();
      }
      break;

    case 'ArrowUp':
      if (listbox.lastElementChild !== null) {
        e.preventDefault(); // FIXME: element.focus({ preventScroll: true}) option not working (Chrome Bug)
        e.stopPropagation();
        (listbox.lastElementChild as HTMLElement).focus();
      }
      break;

    case 'ArrowRight':
      if (e.target !== input) {
        e.stopPropagation();
        input.focus();
      }
      break;

    case 'ArrowLeft':
      if (e.target !== input) {
        e.stopPropagation();
        input.focus();
      }
      break;

    default:
      break;
  }
}
