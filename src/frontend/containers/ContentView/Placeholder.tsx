import React from 'react';
import { observer } from 'mobx-react-lite';
import LOGO_FC from 'resources/logo/svg/full-color/allusion-logomark-fc.svg';

import { useStore } from '../../contexts/StoreContext';

const Placeholder = observer(() => {
  const { tagStore, uiStore } = useStore();

  if (uiStore.showsAllContent && tagStore.isEmpty) {
    // No tags exist, and no images added: Assuming it's a new user -> Show a welcome screen
    return <Welcome />;
  } else if (uiStore.showsAllContent) {
    return <NoContentFound />;
  } else if (uiStore.showsQueryContent) {
    return <NoQueryContent />;
  } else if (uiStore.showsUntaggedContent) {
    return <NoUntaggedContent />;
  } else if (uiStore.showsMissingContent) {
    return <NoMissingContent />;
  } else {
    return <BugReport />;
  }
});

export default Placeholder;

import { IconSet, Button, ButtonGroup, SVG } from 'widgets';

const Welcome = () => {
  const { uiStore } = useStore();
  return (
    <ContentPlaceholder title="Welcome to Allusion" icon={<SVG src={LOGO_FC} />}>
      <p>
        Allusion is a tool designed to help you organize your Visual Library, so you can easily find
        what you need throughout your creative process.
      </p>
      <p>
        Allusion needs to know where to find your images.
        <br />
        Add a Location to get started.
      </p>

      <div className="divider" />

      <p>New to Allusion?</p>
      <Button styling="outlined" text="Open Help Center" onClick={uiStore.toggleHelpCenter} />

      <br />
      <br />
      <br />

      {/* Mention principles (?) */}
      <small>Allusion is a read-only application. We&rsquo;ll never touch your files</small>
    </ContentPlaceholder>
  );
};

const NoContentFound = () => {
  const { uiStore } = useStore();
  return (
    <ContentPlaceholder title="No images" icon={IconSet.MEDIA}>
      <p>Images can be added from the outliner</p>
      <Button onClick={uiStore.toggleOutliner} text="Toggle outliner" styling="outlined" />
    </ContentPlaceholder>
  );
};

const NoQueryContent = () => {
  const { uiStore } = useStore();
  return (
    <ContentPlaceholder title="No images found" icon={IconSet.SEARCH}>
      <p>Try searching for something else.</p>
      <ButtonGroup>
        <Button
          text="All images"
          icon={IconSet.MEDIA}
          onClick={uiStore.viewAllContent}
          styling="outlined"
        />
        <Button
          text="Untagged"
          icon={IconSet.TAG_BLANCO}
          onClick={uiStore.viewUntaggedContent}
          styling="outlined"
        />
      </ButtonGroup>
    </ContentPlaceholder>
  );
};

const NoUntaggedContent = () => {
  const { uiStore } = useStore();
  return (
    <ContentPlaceholder title="No untagged images" icon={IconSet.TAG}>
      <p>All images have been tagged. Nice work!</p>
      <Button
        text="All Images"
        icon={IconSet.MEDIA}
        onClick={uiStore.viewAllContent}
        styling="outlined"
      />
    </ContentPlaceholder>
  );
};

const NoMissingContent = () => {
  const { uiStore } = useStore();
  return (
    <ContentPlaceholder title="No missing images" icon={IconSet.WARNING_BROKEN_LINK}>
      <p>Try searching for something else.</p>
      <ButtonGroup>
        <Button
          text="All images"
          icon={IconSet.MEDIA}
          onClick={uiStore.viewAllContent}
          styling="outlined"
        />
        <Button
          text="Untagged"
          icon={IconSet.TAG_BLANCO}
          onClick={uiStore.viewUntaggedContent}
          styling="outlined"
        />
      </ButtonGroup>
    </ContentPlaceholder>
  );
};

const BugReport = () => {
  return (
    <ContentPlaceholder title="You encountered a bug!" icon={IconSet.WARNING_FILL}>
      <p>Please report this bug to the maintainers!</p>
    </ContentPlaceholder>
  );
};

interface IContentPlaceholder {
  icon: JSX.Element;
  title: string;
  children: React.ReactNode | React.ReactNodeArray;
}

const ContentPlaceholder = (props: IContentPlaceholder) => {
  return (
    <div id="content-placeholder">
      <span className="custom-icon-128">{props.icon}</span>
      <h2 className="dialog-title">{props.title}</h2>
      {props.children}
    </div>
  );
};
