# M3 — checking the training screens on a real phone

M3-T7. The employee half of this module is used by warehouse staff on a phone
between deliveries, so the only verification that counts is on a phone. This is
what to run through, and what the answer should be.

## Before you start

```bash
# Terminal 1
cd backend && npm run seed && npm run dev
# Terminal 2
cd frontend && npm run dev -- --host    # --host exposes it on the LAN
```

Then open `http://<your-machine-ip>:5173` on the phone, on the same Wi-Fi, and
sign in as **SVK-020** (`Savikro#2026`) — the seeded account with a failed
attempt and a passing retake already on record.

## What was built for this, and where to look

| Change | Where | Why |
|---|---|---|
| One question per screen below 700px, all questions above it | `QuizAttempt.jsx` via `useMediaQuery` | A five-question paper on a 360px screen is a scroll with no sense of progress |
| Sticky action bar on narrow screens | `.actionbar` in `components.css` | Puts *Mark complete and continue* and *Submit* in the lower third, under the thumb |
| Options as full-width rows | `.choice--block` | A tap target the width of its own text is a target that gets missed |
| Explicit save state on the quiz | `QuizAttempt.jsx` | "Saving… / Answers saved / Not saved — check your connection". A quiz that silently drops answers is worse than one that refuses them |
| Content list capped and scrollable below 700px | `.builder__list ol` | Stops the running order pushing the content itself off the screen |
| `preload="metadata"` on video | `ModulePlayer.jsx` | The module is usable before the video has downloaded |
| Real `<progress>` elements | Player, quiz, list | The value is in the DOM, so a screen reader announces it instead of describing a decorated div |

Touch targets (44px), the visible focus ring and the AA-checked palette already
came from M2's `base.css` and `components.css`; M3 reuses them rather than
introducing a second set.

## The checklist

### Layout at 360px

- [ ] **Training list** — no horizontal scrolling anywhere on the page.
- [ ] **Module player** — the section list sits above the content, not beside it.
- [ ] **Module player** — *Mark complete and continue* stays visible while you
      scroll through a long walkthrough.
- [ ] **Quiz** — exactly one question on screen, headed "Question 2 of 5".
- [ ] **Quiz** — *Back* and *Next question* are side by side at the bottom and
      reachable with one thumb.
- [ ] **Quiz** — each option is a full-width row, comfortably tappable.
- [ ] Rotate to landscape: the quiz switches to all questions at once above
      700px, and back again on rotating to portrait.

### The loop itself

- [ ] Open a module, mark a section complete — the progress bar and the
      percentage both move.
- [ ] Close the browser, reopen, sign in again — it resumes on the section you
      had not finished. **Nothing is stored in the browser**: progress comes
      back from the server.
- [ ] With sections outstanding, the quiz entry shows a padlock and says how
      many are left.
- [ ] Finish every section — the quiz entry becomes a button.
- [ ] Answer a question, and watch the indicator go *Saving…* then
      *Answers saved*.
- [ ] Turn airplane mode on, answer another question — it says
      *Not saved — check your connection* rather than failing silently. Turn it
      back on, change an answer, and it saves again.
- [ ] Submit with one question unanswered — refused, naming the question number.
- [ ] Fail the quiz — the result names your own answers and the score, and
      **does not** say which option was right.
- [ ] Retake it and pass — the explanations appear only now.

### Accessibility

- [ ] Tab through the quiz with a keyboard (or a phone with a keyboard
      attached): every option and button takes focus, with a visible ring.
- [ ] Every field has a label — no placeholder-only inputs.
- [ ] Text is legible at the phone's default size without pinch-zooming.

### The two numbers, measured rather than assumed

Neither of these is verified by the test suite, so they have to be run by hand.

- [ ] **Lighthouse accessibility ≥ 90.** Chrome DevTools → Lighthouse → tick
      *Accessibility*, device *Mobile*, run against `/training`, then
      `/training/modules/<id>`, then an in-progress attempt. Record the three
      scores; the target is 90 on each.
- [ ] **Page load < 2s on throttled 4G.** DevTools → Network → throttling
      *Fast 4G*, hard-reload each of the same three screens, and read the
      *Load* figure from the network panel.

If the module-player figure is the one that misses, the video is the usual
cause: check it is not being downloaded eagerly, and that the file in
`frontend/public/media/` is a short clip rather than a full-resolution export.
