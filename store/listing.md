# Chrome Web Store listing

The exact text to paste into the Developer Dashboard. The store form is a web
UI with no version history, so the wording lives here instead — particularly
the permission justification, which is the field a reviewer is most likely to
push back on.

Screenshots are in `store/screenshots/`, already at the required 1280x800.
Build the upload zip with `./scripts/package.sh`.

---

## Product details

**Name**

```
Pomium
```

**Short description** (132 characters max — this one is 96)

```
Click any page and a pair of Pomeranians bombs across it, trailing fire. A browser toy, nothing else.
```

**Category**

Fun

**Language**

English (United States)

**Detailed description**

```
Click anywhere on any page and a pair of Pomeranians sweeps across your
screen behind a fire shockwave, with a short camera shake. Hold the button
and drag to stream them continuously.

That is the whole extension. It draws a decorative animation on top of the
page you are already looking at, and does nothing else.

What it does not do:

- It does not read the page. It never touches page text, form fields, or
  anything you type.
- It does not send anything anywhere. There is no server, no analytics, no
  telemetry, no network requests of any kind after install.
- It does not store anything about you. No cookies, no browsing history, no
  local storage of your activity.
- It does not interfere with the page. Clicks pass straight through to
  whatever is underneath, so links, buttons, and form fields keep working
  normally.

It stays dormant until your first click on a page. If you have "reduce
motion" enabled in your operating system's accessibility settings, it stays
dormant entirely.

Inspired by screen.toys/poms.
```

## Single purpose

The Web Store requires one sentence describing a single purpose.

```
Draws a decorative Pomeranian animation over the current page when the user
clicks on it.
```

## Permission justifications

**Host permission — content script matches `<all_urls>`**

```
The extension's only function is to draw a decorative animation over
whichever page the user is currently looking at, triggered by their click.
There is no way to know in advance which pages a user will want to click on,
so the content script has to be able to run wherever they choose.

The content script does not read page content. It attaches passive pointer
listeners, reads only the x coordinate of the click to decide where the
animation enters the screen, and draws into its own canvas inside a closed
shadow root. It never calls preventDefault or stopPropagation, so the page
underneath continues to receive every event normally.

No host permissions beyond the content script match are requested. There is
no background service worker, no network access after install, and no
storage permission.
```

Note: the manifest requests **no** `permissions` array at all — only
`content_scripts.matches` and `web_accessible_resources`. If the dashboard
asks you to justify a permission not listed here, re-read `manifest.json`
before answering; something has been added.

## Privacy practices

**Does this item collect user data?**

```
No
```

If the form requires per-category answers, every category is "not collected":
personally identifiable information, health, financial, authentication,
personal communications, location, web history, user activity, website
content.

**Certifications** — all three apply:

- I do not sell or transfer user data to third parties, apart from the
  approved use cases
- I do not use or transfer user data for purposes unrelated to my item's
  single purpose
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes

**Privacy policy URL**

Not required while the answer to "collects user data" is No. If a reviewer
asks for one anyway, the shortest honest version is a page stating that the
extension collects, stores, and transmits nothing.

## Distribution

**Visibility**

- **Public** — listed and searchable.
- **Unlisted** — anyone with the link can install; not searchable. The usual
  choice for sharing with a handful of people. Note it goes through the same
  review as a public listing.
- **Private** — restricted to named testers or a Workspace domain.

**Regions** — all, unless there is a reason to narrow.

---

## Before you submit

- [x] Bump `manifest.json` version — now `1.0.0`. Every upload must have a
      higher version than the one before it, and versions cannot be reused
      even after a rejection, so bump again before any resubmission.
- [ ] Run `./scripts/package.sh` and confirm `manifest.json` sits at the root
      of the zip, not inside a folder.
- [ ] Load the zip's contents unpacked one final time and click a page — a
      packaging mistake that drops a file shows up instantly and is invisible
      in the diff.
- [ ] Walk `docs/manual-verification.md` if anything in `src/` changed since
      the last pass.
- [ ] Tag the release. `.github/workflows/release.yml` does the rest: on a
      `v*` tag it runs the tests, builds the zip, checks its layout, and
      publishes a GitHub release with the zip attached.

      ```
      git tag v1.0.0 && git push origin v1.0.0
      ```

      The tag must match `manifest.json`'s version or the workflow fails on
      purpose. A hyphenated tag (`v1.0.0-rc1`) publishes as a prerelease
      instead: still downloadable, but not marked latest and no release
      notification — use that to check an artifact before it counts.
