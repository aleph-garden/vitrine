# The pod's browser host, built into a directory of static files for the
# pod's conversion slot to serve. Dependencies come from the lockfile through
# a fixed-output derivation, since bun resolves them from the network.
{
  lib,
  stdenvNoCC,
  writeText,
  bun,
  src,
  # The deployment's Host node: the issuer to log in at, the SPARQL endpoint,
  # and optionally the views and rules to register. What this host opens in
  # place and that it holds a session follow from it being the pod host, so
  # neither is a key. Embedded into index.html.
  host ? {
    issuer = "https://pod.toph.so/";
    sparqlEndpoint = "https://sparql.toph.so";
  },
}: let
  version = "0.0.0";

  hostDocument =
    writeText "host.jsonld" (builtins.toJSON (host
      // {
        "@context" = "https://w3id.org/aleph/ns/view";
        "@type" = "Host";
      }));

  # The install covers the whole workspace, the docs site in packages/www
  # and the aleph.garden host included, so a dependency bump there changes this hash as well and
  # costs the fleet a fresh fetch. The upgrade path is a scoped install
  # (`bun install --filter`) or a lockfile of this host's own.
  node_modules = stdenvNoCC.mkDerivation {
    pname = "vitrine-node-modules";
    inherit version src;
    nativeBuildInputs = [bun];
    dontConfigure = true;
    dontFixup = true;

    buildPhase = ''
      export HOME=$TMPDIR
      bun install --frozen-lockfile --no-progress --ignore-scripts
    '';

    # Workspace packages get their own node_modules with links to the
    # siblings; those are part of what the build needs.
    installPhase = ''
      mkdir -p $out
      cp -R node_modules $out/
      for p in packages/*/; do
        if [ -d "$p/node_modules" ]; then
          mkdir -p "$out/$p"
          cp -R "$p/node_modules" "$out/$p/"
        fi
      done
    '';

    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
    outputHash = "sha256-zT1FjBg8Pg0p6Syfs15ZCXWEaihg28ArReQKtzutrAE=";
  };
in
  stdenvNoCC.mkDerivation {
    pname = "vitrine-pod-host";
    inherit version src;
    nativeBuildInputs = [bun];
    dontConfigure = true;

    buildPhase = ''
      export HOME=$TMPDIR
      cp -R ${node_modules}/node_modules .
      for p in packages/*/; do
        if [ -d "${node_modules}/$p/node_modules" ]; then
          cp -R "${node_modules}/$p/node_modules" "$p/"
        fi
      done
      chmod -R u+w node_modules packages
      (
        cd packages/pod-host
        ALEPH_HOST=${hostDocument} bun --bun node_modules/vite/bin/vite.js build
      )
    '';

    installPhase = ''
      mkdir -p $out
      cp -R packages/pod-host/dist/. $out/
    '';

    meta = {
      description = "The pod's browser host over @aleph-garden/vitrine: a Solid server hands it out as the HTML view of every resource it holds";
      homepage = "https://github.com/aleph-garden/vitrine";
      platforms = lib.platforms.unix;
    };
  }
