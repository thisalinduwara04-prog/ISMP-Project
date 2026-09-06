// A deliberately small markdown renderer for policy bodies.
//
// It builds REACT ELEMENTS rather than an HTML string, so there is no
// dangerouslySetInnerHTML anywhere and a policy body containing markup cannot
// become script. That safety property is the reason this exists at all rather
// than a library: policy text is written by an admin and read by everyone, so
// it is exactly the content you would not want to inject as raw HTML.
//
// Supported, because it is what policy documents actually use: ## headings,
// - bullets, 1. numbered lists, paragraphs, **bold**, *italic* and `code`.

// `__text__` is underline here rather than markdown's usual second spelling of
// bold. Policy documents genuinely underline things, standard markdown has no
// syntax for it, and `**` already covers bold - so the spare marker is put to
// the use the toolbar needs.
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|`[^`]+`)/g;

// Splits one line into plain runs and formatted runs. Keyed by index because
// the pieces of a line have no identity of their own.
const renderInline = (text) =>
  text.split(INLINE).filter(Boolean).map((piece, index) => {
    const key = `${index}-${piece.slice(0, 8)}`;

    if (piece.startsWith('**') && piece.endsWith('**')) {
      return <strong key={key}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith('__') && piece.endsWith('__')) {
      return <u key={key}>{piece.slice(2, -2)}</u>;
    }
    if (piece.startsWith('`') && piece.endsWith('`')) {
      return <code key={key}>{piece.slice(1, -1)}</code>;
    }
    if (piece.startsWith('*') && piece.endsWith('*')) {
      return <em key={key}>{piece.slice(1, -1)}</em>;
    }
    return piece;
  });

// Groups lines into blocks first, so a list stays one <ul> rather than
// becoming a run of single-item lists.
const toBlocks = (source) => {
  const blocks = [];
  let list = null;

  const closeList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  source.split('\n').forEach((raw) => {
    const line = raw.trimEnd();

    if (!line.trim()) return closeList();

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      return blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!list || list.ordered) closeList();
      list = list || { type: 'list', ordered: false, items: [] };
      return list.items.push(bullet[1]);
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      if (!list || !list.ordered) closeList();
      list = list || { type: 'list', ordered: true, items: [] };
      return list.items.push(numbered[1]);
    }

    // A wrapped paragraph continues the previous one rather than starting a
    // new <p> per source line.
    const previous = blocks[blocks.length - 1];
    if (!list && previous && previous.type === 'paragraph') {
      previous.text += ` ${line.trim()}`;
      return undefined;
    }

    closeList();
    return blocks.push({ type: 'paragraph', text: line.trim() });
  });

  closeList();
  return blocks;
};

const MarkdownText = ({ children }) => {
  const blocks = toBlocks(children || '');

  return (
    <div className="prose">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === 'heading') {
          // Policy bodies start at ## so they nest under the page's own <h1>,
          // keeping the heading outline correct for a screen reader.
          const Tag = `h${Math.min(block.level + 1, 6)}`;
          return <Tag key={key}>{renderInline(block.text)}</Tag>;
        }

        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag key={key}>
              {block.items.map((item, itemIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </Tag>
          );
        }

        return <p key={key}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
};

export default MarkdownText;
