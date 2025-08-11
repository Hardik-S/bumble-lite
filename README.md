# Only You (2-user, right-swipe-only)

A tiny Bumble-style web app for **two** users (`hardik`, `ananya`) with fixed passwords. Each user only sees the **other** user's photos. Mobile-friendly for Safari & Chrome.

## Features
- Fixed login pairs:
  - `hardik / iloveananya`
  - `ananya / ilovehardik`
- Upload images to `/images/<username>/` **in your GitHub repo** (with a token), or store locally if no token.
- Feed shows only the other user's images.
- Only **right-swipe** (or press ❤️ Like). Left-swipe is disabled by design.
- Works as a static site on GitHub Pages.

### Configure uploads to GitHub
Uploads require a **fine-grained GitHub Personal Access Token** with **Contents: Read & Write** permission on this one repo.
- Create token: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
- Restrict to this repository, permission **Repository contents: Read and write**.
- In the app, open **⚙️ Settings** and paste:
  - Owner (user/org)
  - Repo
  - Branch (default `main`)
  - Token
- The token is saved in your browser’s `localStorage`. **Do not** share it. Anyone with the token can write to your repo.

> If you don’t enter a token, uploads are kept **locally** in your browser only and won’t be visible to the other person.

## Folder layout
```
/
  index.html
  style.css
  app.js
  images/
    hardik/   (created by app if using token, else you can pre-create)
    ananya/
```
You may delete placeholder folders; the app creates paths as needed when uploading with a token.

## Notes & Limits
- Static only; no server. All writes use GitHub’s REST API from the browser.
- Directory listing uses `GET /repos/{owner}/{repo}/contents/images/<user>` which works for public repos.
- iOS Safari and Android Chrome supported; gestures implement **right-swipe** only.
- Security: a token in the browser is a trade-off to meet “save to GitHub” on a static site. Limit token scope to this repo.
