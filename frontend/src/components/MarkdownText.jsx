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
// Training content adds two more: > quotes (an example email, a tip) and
// | pipe | tables |.

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

// Paragraph alignment. Markdown has no syntax for it, so `::center::` at the
// very start of a paragraph is a convention of our own - written by the
// toolbar, stripped here, and turned into a class rather than an inline style.
// Left is the default and needs no marker.
const ALIGN_MARKER = /^::(left|center|right)::\s*/;

const takeAlignment = (text) => {
  const match = text.match(ALIGN_MARKER);
  if (!match) return { text, align: null };

  return { text: text.slice(match[0].length), align: match[1] };
};

// Groups lines into blocks first, so a list stays one <ul> rather than
// becoming a run of single-item lists.
// The cells of one `| a | b |` row. The outer pipes are optional.
const tableCells = (line) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

// The `|---|:---:|` line between a table's header and its body.
const isTableDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

const toBlocks = (source) => {
  const blocks = [];
  let list = null;

  const closeList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  source.split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    const previousBlock = blocks[blocks.length - 1];

    if (!line.trim()) return closeList();

    // Each quoted line keeps its own line, because what is quoted is usually
    // an email where From and Subject must not run together. A bare `>` is a
    // gap inside the same quote.
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      closeList();
      if (previousBlock && previousBlock.type === 'quote') {
        previousBlock.lines.push(quote[1]);
        return undefined;
      }
      return blocks.push({ type: 'quote', lines: [quote[1]] });
    }

    if (line.trim().startsWith('|')) {
      closeList();
      if (previousBlock && previousBlock.type === 'table') {
        if (!isTableDivider(line)) previousBlock.rows.push(tableCells(line));
        return undefined;
      }
      return blocks.push({ type: 'table', header: tableCells(line), rows: [] });
    }

    // The marker sits before the heading hashes, so it is taken off first.
    const { text: unaligned, align } = takeAlignment(line);

    const heading = unaligned.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      return blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2],
        align,
      });
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
    return blocks.push({ type: 'paragraph', text: unaligned.trim(), align });
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

        const alignClass = block.align ? `align-${block.align}` : undefined;

        if (block.type === 'heading') {
          // Policy bodies start at ## so they nest under the page's own <h1>,
          // keeping the heading outline correct for a screen reader.
          const Tag = `h${Math.min(block.level + 1, 6)}`;
          return (
            <Tag key={key} className={alignClass}>
              {renderInline(block.text)}
            </Tag>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key}>
              {block.lines.map((text, lineIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <p key={lineIndex}>{text.trim() ? renderInline(text) : null}</p>
              ))}
            </blockquote>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={key} className="table-wrap">
              <table className="table table--fixed">
                <thead>
                  <tr>
                    {block.header.map((cell, cellIndex) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <th key={cellIndex} scope="col">{renderInline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <td key={cellIndex}>{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
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

        return (
          <p key={key} className={alignClass}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
};

export default MarkdownText;
