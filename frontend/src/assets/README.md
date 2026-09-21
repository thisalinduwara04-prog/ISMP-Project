# Interface images

Images the interface itself draws: a logo, an illustration on the sign-in card,
an empty-state graphic. Drop the file here and `import` it in the component that
uses it:

```jsx
import logo from '../assets/logo.svg';

<img src={logo} alt="Savikro" className="brand-logo" />
```

Vite resolves that import to a hashed URL and the file is copied into the build,
so a cached old version is never served after you replace one.

## This folder or `public/media`?

| | `src/assets` (here) | `frontend/public/media` |
|---|---|---|
| Referenced by | an `import` in a component | a literal path, `/media/…` |
| Part of | the interface | the content an admin authors |
| Renaming a file | breaks the build, immediately | silently breaks the module pointing at it |

Put a logo or an icon here. Put a training video, a PDF or a picture used
*inside* a training module in `public/media` — those are content, and an
administrator types their path into the module builder.

## What to put here

- **SVG** for logos, marks and icons. It stays sharp at any size and is usually
  the smallest file.
- **PNG** where transparency is needed and the artwork is not vector.
- **JPG** for photographs only.

Keep these small — every file here is bundled into the application and
downloaded by everyone who signs in.

## Two things to know

**Inline SVG is often the better answer for an icon.** `Icon.jsx` draws the
sidebar and widget icons as inline paths that inherit `currentColor`, so they
recolour with the theme. An imported `.svg` rendered through `<img>` cannot do
that. Add a path to `Icon.jsx` rather than a file here when the thing you need
is a one-colour glyph.

**Every image needs an `alt`.** Describe it if it carries meaning
(`alt="Savikro"`), or pass `alt=""` if it is decorative and the text beside it
already says the same thing (NFR-USE-03).
