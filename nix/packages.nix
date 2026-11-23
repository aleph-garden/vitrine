{self, ...}: {
  systems = ["x86_64-linux" "aarch64-linux" "aarch64-darwin"];

  perSystem = {pkgs, ...}: let
    # nixpkgs carries a `host` package (bind's), and callPackage's automatic
    # arguments outrank a default, so the build would take that in place of
    # its Host document.
    callPackage = pkgs.lib.callPackageWith (builtins.removeAttrs pkgs ["host"]);
  in {
    packages = rec {
      pod-host = callPackage ./_pod-host.nix {src = self;};
      default = pod-host;
    };
  };
}
