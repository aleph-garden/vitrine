# Publishing

Six packages go to npm under the `@aleph-garden` scope, all at version
`0.1.0-dev`:

| Package | Depends on |
| --- | --- |
| `@aleph-garden/terms` | nothing in the scope |
| `@aleph-garden/vitrine` | `terms` |
| `@aleph-garden/host-core` | `terms`, `vitrine` |
| `@aleph-garden/vitrine-turtle` | `vitrine` |
| `@aleph-garden/vitrine-jsonld` | `vitrine` |
| `@aleph-garden/vitrine-markdown` | `terms`, `vitrine` |

`garden-host`, `pod-host`, `www`, `vitrine-examples` and `annotate` carry
`"private": true` and npm refuses to publish them.

## How a package is built

`bun run build:packages` compiles every publishable package with
`scripts/build-package.ts` and writes `packages/<name>/dist`. That directory is
the tarball root: it holds the JavaScript, the declaration files, the
stylesheet and font `host-core` exports, the README, the LICENSE, and a
`package.json` whose `exports` point at the built files beside them.

`npm pack` and `npm publish` run **inside `packages/<name>/dist`**, never in
the package directory. The package directory's own `exports` point at
`src/*.ts` and have to keep doing so, because `garden-host`, `pod-host`, `www`
and the test suite resolve these packages through the bun workspace and read
the source. npm has no way to swap `exports` at publish time: its
`publishConfig` is flattened into npm's own config and only keys that are npm
config settings take effect, so `publishConfig.exports` is ignored (npm 11
warns about it as an unknown key). The build writes the registry's manifest
instead.

## The first publish, by hand

OIDC cannot create a package that does not exist yet, so the first version of
each of the six goes up from a workstation. Everything after that can go
through `.github/workflows/publish.yml`.

```sh
# 1. Authenticate. ~/.npmrc is an agenix symlink whose token does not work;
#    move it aside first so `npm login` can write a fresh one.
mv ~/.npmrc ~/.npmrc.agenix
npm login
npm whoami                      # must print the account, not 401

# 2. Build from a clean tree and confirm the repository is green.
cd ~/code/aleph-garden/view
bun run check:ci
bun run build:packages

# 3. Look at what each tarball would carry before sending any of it.
for p in terms vitrine host-core vitrine-turtle vitrine-jsonld vitrine-markdown
  npm pack --dry-run packages/$p/dist
end

# 4. Publish in dependency order. Each dist/package.json carries
#    publishConfig.access=public and publishConfig.tag=dev, so the scoped
#    packages go up public and none of them claims the `latest` tag.
npm publish packages/terms/dist
npm publish packages/vitrine/dist
npm publish packages/host-core/dist
npm publish packages/vitrine-turtle/dist
npm publish packages/vitrine-jsonld/dist
npm publish packages/vitrine-markdown/dist

# 5. Verify.
for p in terms vitrine host-core vitrine-turtle vitrine-jsonld vitrine-markdown
  npm view @aleph-garden/$p dist-tags version
end
cd (mktemp -d); npm init -y >/dev/null
npm install @aleph-garden/vitrine@dev @aleph-garden/host-core@dev
node -e "import('@aleph-garden/vitrine').then(m => console.log(Object.keys(m)))"

# 6. Restore the agenix npmrc.
mv ~/.npmrc.agenix ~/.npmrc
```

The loops are fish syntax, matching the login shell here.

### What the first publish did, 2026-09-22

All six went up and both tags point at `0.1.0-dev`:

```
terms  vitrine  host-core  vitrine-turtle  vitrine-jsonld  vitrine-markdown
  dev=0.1.0-dev  latest=0.1.0-dev
```

`publishConfig.tag: dev` did not keep `latest` off the prerelease, because a
package with no versions yet gets its first one as `latest` whatever tag the
publish names. The registry protects `latest` and answers `npm dist-tag rm`
with HTTP 400, so it cannot be taken back.

What follows from that, correcting the paragraph below: a bare
`npm install @aleph-garden/vitrine` resolves to `0.1.0-dev` today rather than
failing with `ETARGET`. It stops doing so once a version without a prerelease
suffix is published, which moves `latest` to that version.

### Why the `dev` tag

`0.1.0-dev` is a prerelease. npm 11 refuses to publish a prerelease under the
default `latest` tag and tells you to pass `--tag`; npm 10 accepts it silently
and points `latest` at it, which makes every plain `npm install` of the package
pull a development version. `publishConfig.tag` in each built manifest settles
it for both.

While `latest` is unset, `npm install @aleph-garden/vitrine` fails with
`ETARGET`: npm resolves a bare install through the `latest` tag and falls back
to a range of `*`, which a prerelease version does not satisfy. Consumers
install `@aleph-garden/vitrine@dev` or an exact version until a non-prerelease
release exists.

## After the first publish

For each of the six, configure a trusted publisher on npmjs.com under the
package's Settings: GitHub Actions, repository `aleph-garden/vitrine`, workflow
`publish.yml`. Then set the repository variable `NPM_TRUSTED_PUBLISHING` to
`enabled`, and pushing a `v*` tag releases.

## Raising the version

Version numbers live in `packages/<name>/package.json`. The cross-package
`workspace:*` ranges are rewritten to the exact version at build time, so all
six move together. Change all six, then tag.

## Configuring the trusted publishers

Done once per package, on npmjs.com, after the package exists. The fields are
case-sensitive and the workflow file has to exist under that exact name.

| Field | Value |
| --- | --- |
| Owner | `aleph-garden` |
| Repository | `vitrine` |
| Workflow filename | `publish.yml` |
| Environment | `npm` |

**Fill the environment field.** Left empty, any run of `publish.yml` in this
repository can mint an OIDC token and publish. Filled, the token is minted only
inside the `npm` environment, whose rules gate it.

That environment exists on the repository already, created 2026-09-22 with two
rules: a required reviewer, and a deployment policy restricting it to `v*`
tags. So a release stops for an approval, and a run from anything other than a
version tag cannot enter the environment at all.

`.github/workflows/publish.yml` names `environment: npm` in its publish job,
and `vars.NPM_TRUSTED_PUBLISHING` is set to `enabled`.
