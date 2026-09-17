# The browser shell, built into a directory of static files for the pod's
# conversion slot to serve. Dependencies come from the lockfile through a
# fixed-output derivation, since bun resolves them from the network.
{
  lib,
  stdenvNoCC,
  writeText,
  bun,
  src,
  # The deployment's Host node: the issuer to log in at, the SPARQL endpoint,
  # and optionally the views and rules to register. Embedded into index.html.
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

  node_modules = stdenvNoCC.mkDerivation {
    pname = "aleph-view-node-modules";
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
    outputHash = "sha256-xTz0m9IUcohWx6Om3m8qjQpXhXaBOulC14gfTHup5ZE=";
  };
in
  stdenvNoCC.mkDerivation {
    pname = "aleph-view-shell";
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
        cd packages/shell
        ALEPH_HOST=${hostDocument} bun --bun node_modules/vite/bin/vite.js build
      )
    '';

    installPhase = ''
      mkdir -p $out
      cp -R packages/shell/dist/. $out/
    '';

    meta = {
      description = "Browser shell of @aleph-garden/view, served by a Solid pod as its HTML view";
      homepage = "https://github.com/aleph-garden/view";
      platforms = lib.platforms.unix;
    };
  }
