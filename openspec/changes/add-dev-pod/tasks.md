## 1. Server package

- [ ] 1.1 Add a flake-parts module building Community Solid Server 7.2.0 from the `v7.2.0` tag with `buildNpmPackage` and Node 22; verify `nix run .#community-solid-server -- --version` prints 7.2.0

## 2. Configuration and seed data

- [ ] 2.1 Write `dev-pod/server-config.json` from the file-storage preset plus the pod host converter and static asset entry; verify the server starts with it and answers a GET on `/` with the pod host's `index.html` for `Accept: text/html`
- [ ] 2.2 Add the account seed with a pod named `dev` and fixed credentials; verify an anonymous GET on `/dev/` carries `WAC-Allow` with `user="read"`
- [ ] 2.3 Add `dev-pod/seed/` with two linked Markdown notes, one Turtle document and their container, and the seed step that PUTs them as the account when the pod lacks them; verify a second start leaves an edited note unchanged

## 3. App and recipe

- [ ] 3.1 Add the `dev-pod` app that runs the vite watch build and the server, binds the server to 127.0.0.1, and stops both on exit; add `just dev-pod` and `.dev-pod/` to `.gitignore`; verify a source change in the Markdown view shows after a reload
- [ ] 3.2 Log in through the pod host with the development account and confirm `WAC-Allow` on a seeded note grants `write`

## 4. Documentation

- [ ] 4.1 Describe `just dev-pod`, the development credentials and the reset in `docs/run/`; verify with `just check`
