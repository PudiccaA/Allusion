import { action } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { ReactElement, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { generateId } from 'src/entities/ID';
import { ClientTag, ROOT_TAG_ID } from 'src/entities/Tag';
import { IconButton, IconSet, Option, Tag } from 'widgets';
import { ControlledListbox, controlledListBoxKeyDown } from 'widgets/Combobox/ControlledListBox';
import { IOption } from 'widgets/Combobox/Listbox';
import { MenuDivider } from 'widgets/menus';
import { Flyout } from 'widgets/popovers';
import StoreContext from '../contexts/StoreContext';

interface IMultiTagSelector {
  selection: ClientTag[];
  onSelect: (item: ClientTag) => void;
  onDeselect: (item: ClientTag) => void;
  onTagClick?: (item: ClientTag) => void;
  onClear: () => void;
  onCreate?: (name: string) => Promise<ClientTag>;
  tagLabel?: (item: ClientTag) => string;
  disabled?: boolean;
  autoFocus?: boolean;
  extraOption?: { label: string; action: () => void; icon?: JSX.Element };
  extraIconButtons?: ReactElement;
  defaultPrevented?: boolean;
}

const MultiTagSelector = observer((props: IMultiTagSelector) => {
  const {
    selection,
    onSelect,
    onDeselect,
    onTagClick,
    onClear,
    onCreate,
    tagLabel = action((t: ClientTag) => t.name),
    disabled,
    extraOption,
    extraIconButtons,
    autoFocus,
  } = props;
  const listboxID = useRef(generateId());
  const { tagStore } = useContext(StoreContext);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.toLowerCase();

  const suggestions = tagStore.tagList.filter(
    (t) => t.id !== ROOT_TAG_ID && t.name.toLowerCase().indexOf(normalizedQuery) >= 0,
  );

  // Assemble list of options
  const options = useMemo(() => {
    const res: (IOption & { id: string; divider?: boolean })[] = suggestions.map((t) => {
      const isSelected = selection.includes(t);
      return {
        id: t.id,
        selected: isSelected,
        value: t.name,
        onClick: () => {
          if (!isSelected) {
            onSelect(t);
          } else {
            onDeselect(t);
          }
          // setIsOpen(false);
          // setQuery('');
        },
      };
    });

    if (onCreate && suggestions.length === 0) {
      res.push({
        id: 'create',
        selected: false,
        value: `Create Tag "${query}"`,
        icon: IconSet.TAG_ADD,
        onClick: async () => {
          onSelect(await onCreate(query));
          setQuery('');
          // setIsOpen(false);
        },
      });
    }
    if (extraOption) {
      res.push({
        id: 'extra-option',
        value: extraOption.label,
        onClick: extraOption.action,
        icon: extraOption.icon,
        divider: suggestions.length !== 0,
      });
    }
    return res;
  }, [extraOption, onCreate, onDeselect, onSelect, query, selection, suggestions]);

  // Todo: clamp this value when list size changes
  const [focusedOption, setFocusedOption] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Backspace') {
        e.stopPropagation();

        // Remove last item from selection with backspace
        if (query.length === 0 && selection.length > 0) {
          onDeselect(selection[selection.length - 1]);
        }
      }
      controlledListBoxKeyDown(e, listRef, setFocusedOption, focusedOption);
    },
    [focusedOption, onDeselect, query.length, selection],
  );

  return (
    <div
      role="combobox"
      aria-expanded={isOpen}
      className="input"
      onBlur={(e) => {
        if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.matches('[role="option"]')) {
          return;
        }
        setIsOpen(false);
      }}
    >
      <Flyout
        isOpen={isOpen}
        cancel={() => setIsOpen(false)}
        placement="bottom-start"
        target={
          <div className="multiautocomplete-input">
            <div className="input-wrapper">
              {selection.map((t) => (
                <Tag
                  key={t.id}
                  text={tagLabel(t)}
                  color={t.viewColor}
                  onRemove={() => onDeselect(t)}
                  onClick={onTagClick ? () => onTagClick(t) : undefined}
                />
              ))}
              <input
                disabled={disabled}
                type="text"
                value={query}
                aria-autocomplete="list"
                onChange={(e) => {
                  setIsOpen(true);
                  setQuery(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                aria-controls={listboxID.current}
                autoFocus={autoFocus}
              />
            </div>
            {extraIconButtons}
            <IconButton
              icon={IconSet.CLOSE}
              text="Close"
              onClick={() => {
                setQuery('');
                onClear();
              }}
            />
          </div>
        }
      >
        <ControlledListbox id={listboxID.current} multiselectable listRef={listRef}>
          {options.map((o, i) => {
            return (
              <React.Fragment key={o.id}>
                {o.divider && <MenuDivider />}
                <Option {...o} focused={focusedOption === i} />
              </React.Fragment>
            );
          })}
        </ControlledListbox>
      </Flyout>
    </div>
  );
});

export { MultiTagSelector };