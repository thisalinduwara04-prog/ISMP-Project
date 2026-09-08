import { useRef } from 'react';

// A formatting toolbar over a plain textarea.
//
// The stored value stays markdown-ish text, not HTML, and MarkdownText renders
// it into React elements. That is a deliberate choice over a contentEditable
// WYSIWYG: a rich editor would store markup written by one user and shown to
// every other, which would have to be injected as raw HTML to display - the
// classic stored-XSS shape. Formatting people can apply, and nothing they type
// can ever become an element.
//
// Each button wraps the current selection, or inserts a placeholder when there
// is none, then restores the selection so typing continues naturally.

const WRAPPERS = {
  bold: { before: '**', after: '**', placeholder: 'bold text' },
  italic: { before: '*', after: '*', placeholder: 'italic text' },
  underline: { before: '__', after: '__', placeholder: 'underlined text' },
  code: { before: '`', after: '`', placeholder: 'code' },
};

const LINE_PREFIXES = {
  h2: '## ',
  h3: '### ',
  bullet: '- ',
  numbered: '1. ',
};

// Markdown has no alignment syntax, so this is a convention of our own:
// a marker at the very start of a paragraph, understood by MarkdownText and
// stripped before the text is shown. Left is the default and writes no marker,
// which keeps ordinary paragraphs free of noise.
const ALIGN_MARKER = /^::(left|center|right)::\s*/;

const RichTextArea = ({
  id,
  value,
  onChange,
  disabled,
  rows = 16,
  placeholder,
  onAttach,
  attachLabel = 'Attach a PDF',
  attachDisabled = false,
}) => {
  const ref = useRef(null);

  const apply = (mutate) => {
    const area = ref.current;
    if (!area) return;

    const { selectionStart, selectionEnd } = area;
    const { text, start, end } = mutate(value, selectionStart, selectionEnd);

    onChange(text);

    // The value change re-renders before the caret can be moved, so this waits
    // a tick - otherwise the cursor jumps to the end of the document.
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start, end);
    });
  };

  const wrap = (kind) =>
    apply((text, from, to) => {
      const { before, after, placeholder: fallback } = WRAPPERS[kind];
      const selected = text.slice(from, to) || fallback;
      const next = `${text.slice(0, from)}${before}${selected}${after}${text.slice(to)}`;

      return {
        text: next,
        start: from + before.length,
        end: from + before.length + selected.length,
      };
    });

  // Applied to whole lines, so selecting three lines and pressing the bullet
  // button makes three bullets rather than one.
  const prefixLines = (kind) =>
    apply((text, from, to) => {
      const prefix = LINE_PREFIXES[kind];
      const lineStart = text.lastIndexOf('\n', from - 1) + 1;
      const lineEnd = text.indexOf('\n', to) === -1 ? text.length : text.indexOf('\n', to);

      const block = text.slice(lineStart, lineEnd) || 'Heading';
      const lines = block.split('\n');
      const alreadyPrefixed = lines.every((line) => line.startsWith(prefix));

      const rewritten = lines
        .map((line, index) => {
          const bare = line.replace(/^(#{1,4}\s+|[-*]\s+|\d+\.\s+)/, '');
          if (alreadyPrefixed) return bare;
          return kind === 'numbered' ? `${index + 1}. ${bare}` : `${prefix}${bare}`;
        })
        .join('\n');

      const next = `${text.slice(0, lineStart)}${rewritten}${text.slice(lineEnd)}`;
      return { text: next, start: lineStart, end: lineStart + rewritten.length };
    });

  // Alignment belongs to the whole paragraph, not to a line or a selection, so
  // this walks back to the start of the block the cursor sits in and rewrites
  // the marker there. Any existing marker is replaced rather than stacked.
  const align = (which) =>
    apply((text, from) => {
      const blankBefore = text.lastIndexOf('\n\n', Math.max(0, from - 1));
      const blockStart = blankBefore === -1 ? 0 : blankBefore + 2;

      const lineEnd = text.indexOf('\n', blockStart) === -1 ? text.length : text.indexOf('\n', blockStart);
      const firstLine = text.slice(blockStart, lineEnd);
      const bare = firstLine.replace(ALIGN_MARKER, '');

      const marker = which === 'left' ? '' : `::${which}:: `;
      const rewritten = `${marker}${bare}`;

      const next = `${text.slice(0, blockStart)}${rewritten}${text.slice(lineEnd)}`;
      const caret = blockStart + rewritten.length;

      return { text: next, start: caret, end: caret };
    });

  const button = (label, title, onClick, { className = '', isDisabled = false } = {}) => (
    <button
      type="button"
      className={`toolbar__btn ${className}`}
      title={title}
      aria-label={title}
      disabled={disabled || isDisabled}
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className="editor">
      <div className="toolbar" role="toolbar" aria-label="Text formatting">
        {button('B', 'Bold', () => wrap('bold'), { className: 'toolbar__btn--bold' })}
        {button('I', 'Italic', () => wrap('italic'), { className: 'toolbar__btn--italic' })}
        {button('U', 'Underline', () => wrap('underline'), { className: 'toolbar__btn--underline' })}
        <span className="toolbar__divider" aria-hidden="true" />

        {button('H2', 'Heading', () => prefixLines('h2'))}
        {button('H3', 'Sub-heading', () => prefixLines('h3'))}
        <span className="toolbar__divider" aria-hidden="true" />

        {button('• List', 'Bulleted list', () => prefixLines('bullet'))}
        {button('1. List', 'Numbered list', () => prefixLines('numbered'))}
        <span className="toolbar__divider" aria-hidden="true" />

        {/* Alignment applies to the paragraph the cursor is in. */}
        {button('≡', 'Align left', () => align('left'), { className: 'toolbar__btn--align-left' })}
        {button('≡', 'Align centre', () => align('center'), {
          className: 'toolbar__btn--align-center',
        })}
        {button('≡', 'Align right', () => align('right'), {
          className: 'toolbar__btn--align-right',
        })}
        <span className="toolbar__divider" aria-hidden="true" />

        {button('</>', 'Code', () => wrap('code'))}

        {onAttach && (
          <>
            <span className="toolbar__divider" aria-hidden="true" />
            {button('📎 PDF', attachLabel, onAttach, {
              className: 'toolbar__btn--attach',
              isDisabled: attachDisabled,
            })}
          </>
        )}
      </div>

      <textarea
        id={id}
        ref={ref}
        className="field__input field__input--area editor__area"
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
};

export default RichTextArea;
