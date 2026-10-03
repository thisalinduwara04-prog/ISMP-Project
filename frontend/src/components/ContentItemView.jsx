import MarkdownText from './MarkdownText';

// One training content item as staff see it: markdown for the written
// sections, a player for video, a link for a PDF. Shared by the module player
// and the admin's read-only view, so both show exactly the same thing.

// The API refuses anything else, but a record saved before that rule existed
// could still hold a `javascript:` URL, which React 18 would render as-is.
const isWebUrl = (url) => /^(https?:\/\/|\/)/i.test(url || '');

// A YouTube page is not a video file, so a <video> tag cannot play it - it has
// to be embedded. Only the 11-character video id is taken from the link, and
// the embed address is built from that alone, so nothing else in a pasted URL
// reaches the page. Anything that is not a recognisable YouTube link gives null.
const YOUTUBE_ID = /^[\w-]{11}$/;

const youTubeId = (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^(www|m)\./, '');
  let id = null;

  if (host === 'youtu.be') id = parsed.pathname.slice(1);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = parsed.searchParams.get('v') || parsed.pathname.match(/^\/(embed|shorts)\/([^/]+)/)?.[2];
  }

  return id && YOUTUBE_ID.test(id) ? id : null;
};

const ContentItemView = ({ item }) => {
  if ((item.type === 'VIDEO' || item.type === 'PDF') && !isWebUrl(item.mediaUrl)) {
    return <p className="muted">This item has no valid link.</p>;
  }

  // `preload="metadata"` so a phone on 4G does not download the whole file
  // before the page is usable.
  const videoId = item.type === 'VIDEO' ? youTubeId(item.mediaUrl) : null;
  if (videoId) {
    // youtube-nocookie: YouTube's privacy-enhanced mode, which sets no
    // tracking cookies until the viewer actually plays the video.
    return (
      <div className="player__embed">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={item.title}
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

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
