{
  description = "Vitrine: a rendering layer for IRIs, one IRI in, HTML out";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "aarch64-darwin"];
    forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    # nixpkgs carries a `host` package (bind's), and callPackage's automatic
    # arguments outrank a default, so the build would take that in place of
    # its Host document.
    callPackage = pkgs: pkgs.lib.callPackageWith (builtins.removeAttrs pkgs ["host"]);
  in {
    packages = forAll (pkgs: rec {
      pod-host = callPackage pkgs ./nix/pod-host.nix {src = self;};
      default = pod-host;
    });

    devShells = forAll (pkgs: {
      default = pkgs.mkShell {packages = [pkgs.bun];};
    });
  };
}
