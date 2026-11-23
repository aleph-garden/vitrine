# list recipes
default:
    @just --list

# rerun the tests on every change
dev:
    bun test --watch

# run the type check and the tests
test *args:
    bun run typecheck
    bun test {{ args }}

# format all files
fmt:
    treefmt

# everything CI checks
check:
    nix flake check
