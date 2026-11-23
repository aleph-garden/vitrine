{
  inputs,
  self,
  ...
}: {
  imports = [inputs.devkit.flakeModules.default];

  perSystem = {
    config,
    pkgs,
    ...
  }: {
    devkit.packages = [pkgs.bun];
    devkit.fixtures = ["packages/*/test/fixtures/**"];

    # Biome runs as a plain formatter: treefmt-nix's biome program passes a
    # generated --config-path, so the repository's biome.json would not apply.
    treefmt.settings.formatter.biome = {
      command = pkgs.lib.getExe pkgs.biome;
      options = ["check" "--write" "--no-errors-on-unmatched"];
      includes = ["*.js" "*.mjs" "*.ts" "*.tsx" "*.json" "*.jsonc" "*.css"];
    };

    # The tests need the npm dependencies, which the sandbox cannot fetch, so
    # they run against the tree the pod host's build installs instead of
    # through devkit.testCommand.
    checks.test = pkgs.runCommand "test" {nativeBuildInputs = [pkgs.bun pkgs.nodejs];} ''
      export HOME=$TMPDIR
      cp -r ${self} src
      chmod -R u+w src
      cd src
      ${config.packages.pod-host.passthru.linkNodeModules}
      # The sandbox has no /usr/bin/env for tsc's shebang.
      patchShebangs node_modules/typescript/bin
      bun run typecheck
      bun test
      touch $out
    '';
  };
}
