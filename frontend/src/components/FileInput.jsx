import { useRef } from 'react';

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Once a file is chosen the native control is replaced by a summary with a
// Remove action, because the browser's own "no file selected" text gives no way
// to change your mind on a phone.
const FileInput = ({ id, name, file, onChange, accept, maxBytes, disabled = false }) => {
  const inputRef = useRef(null);

  const clear = () => {
    // The DOM input keeps its own value, so clearing React state alone would
    // stop the same file being re-selected afterwards.
    if (inputRef.current) inputRef.current.value = '';
    onChange(null);
  };

  const tooLarge = file && maxBytes && file.size > maxBytes;

  if (file) {
    return (
      <div className="field__file">
        <div className="field__file-meta">
          <strong>{file.name}</strong>
          <small className={tooLarge ? 'field__error' : undefined}>
            {formatSize(file.size)}
            {tooLarge && ` — over the ${formatSize(maxBytes)} limit`}
          </small>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={clear} disabled={disabled}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      id={id}
      name={name}
      type="file"
      className="field__input field__file-input"
      accept={accept}
      disabled={disabled}
      onChange={(event) => onChange(event.target.files?.[0] || null)}
    />
  );
};

export default FileInput;
