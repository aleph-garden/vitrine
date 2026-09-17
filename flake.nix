{
  description = "Rendering layer for resources on a Solid pod: one IRI in, HTML out";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "aarch64-darwin"];
    forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
  in {
    packages = forAll (pkgs: rec {
      shell = pkgs.callPackage ./nix/shell.nix {src = self;};
      default = shell;
    });

    devShells = forAll (pkgs: {
      default = pkgs.mkShell {packages = [pkgs.bun];};
    });
  };
}
