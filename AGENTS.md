# Agents

- Run `just` to list the recipes. `just test` runs the tests, `just fmt`
  formats.
- Run `just check` before calling a change done. It runs everything CI runs:
  formatting, linters, prose-check and the tests.
- Layout: every `.nix` file under `nix/` is a flake-parts module; a Nix file
  that is not one sits in a directory or file whose name starts with `_`.
- Changes are specified with OpenSpec: `openspec/specs/` holds the binding
  specification, `/openspec-propose` starts a change against it.
