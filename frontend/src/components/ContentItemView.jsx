import MarkdownText from './MarkdownText';

// One training content item as staff see it: markdown for the written
// sections, a player for video, a link for a PDF. Shared by the module player
// and the admin's read-only view, so both show exactly the same thing.

// The API refuses anything else, but a record saved before that rule existed
// could still hold a `javascript:` URL, which React 18 would render as-is.
const isWebUrl = (url) => /^(https?:\/\/|\/)/i.test(url || '');

const ContentItemView = ({ item }) => {
  if ((item.type === 'VIDEO' || item.type === 'PDF') && !isWebUrl(item.mediaUrl)) {
    return <p className="muted">This item has no valid link.</p>;
  }

  // `preload="metadata"` so a phone on 4G does not download the whole file
  // before the page is usable.
  if (item.type === 'VIDEO') {
    return (
      <video className="player__video" src={item.mediaUrl} controls preload="metadata">
        <track kind="captions" />
        <a href={item.mediaUrl}>Download the video</a>
      </video>
    );
  }

  if (item.type === 'PDF') {
    return (
      <p>
        <a className="btn btn--ghost" href={item.mediaUrl} target="_blank" rel="noreferrer">
          Open the PDF
        </a>
      </p>
    );
  }

  return (
    <div className="prose">
      <MarkdownText>{item.body}</MarkdownText>
    </div>
  );
};

export default ContentItemView;
