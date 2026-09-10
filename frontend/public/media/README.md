# Local demo media

Drop training videos and PDFs in this folder to use them without hosting them
anywhere. Vite serves `public/` from the site root, in dev and in a build alike,
so a file placed here:

    frontend/public/media/phishing.mp4

is reachable at:

    /media/phishing.mp4

Paste that path into the **Video link** or **PDF link** field of a content item
in the training module builder. The same field still accepts a full external
URL (`https://…`), so uploading here is the alternative for when there is
nowhere to host the file — not a replacement.

## What to put here

- **Video:** MP4 with H.264 video and AAC audio. Every browser plays it; `.mkv`
  and most `.avi` files do not. Keep clips short — 30 to 60 seconds is plenty
  for a demo, and the file is committed to the repository, so a 200 MB video
  becomes a 200 MB clone for everybody.
- **PDF:** anything. It opens in the browser's own viewer.

## Two things to know

**These files are public.** Anything in this folder is served by the web server
without a login, so the audience rules that govern a training module do not
apply to the file itself: someone who knows the path can fetch it without
signing in. That is the trade for not hosting anything, and it is fine for
demonstration material. Do not put real customer data or anything confidential
here.

**They are part of the frontend, not the database.** A module references a file
by path, so deleting or renaming a file here breaks the link in any module that
points at it. Nothing warns you — the content item simply shows a video that
will not load.
