## Purpose

Gives a developer a Solid server on their own machine that serves the pod
host from the working tree, so a change can be tried in a browser without a
deploy.

## ADDED Requirements

### Requirement: One command starts the development pod
`just dev-pod` SHALL start Community Solid Server 7.2.0, built by the flake, on
`http://localhost:3000/`, listening on the loopback interface only. It SHALL
need nothing besides Nix and the checkout.

#### Scenario: Start on a fresh checkout
- **WHEN** a developer runs `just dev-pod` in a checkout without `.dev-pod/`
- **THEN** the server answers `http://localhost:3000/` within 60 seconds of the build finishing

#### Scenario: Not reachable from the network
- **WHEN** the development pod runs
- **THEN** a connection to port 3000 on any address other than loopback is refused

### Requirement: Every resource is served with the working tree's pod host
A browser request for any resource SHALL receive the pod host built from the
working tree as its HTML representation, the way pod.toph.so serves it. When
a source file of the pod host or of a package it bundles changes, the
development pod SHALL rebuild the pod host, and the next page load SHALL use
the new build without a server restart.

#### Scenario: Open a note
- **WHEN** a browser opens a seeded Markdown note on the development pod
- **THEN** the pod host renders the note

#### Scenario: Edit a view
- **WHEN** a developer changes the Markdown view's source while the development pod runs, and reloads the page after the rebuild
- **THEN** the page shows the changed view

### Requirement: The pod starts with seed data
On a start without `.dev-pod/`, the development pod SHALL create it and fill
the pod with the seed data kept in the repository: at least two Markdown notes
that link to each other, one Turtle document and one container listing them.
On a start with `.dev-pod/` present it SHALL keep its contents. Deleting
`.dev-pod/` SHALL reset the pod to the seed data on the next start.

#### Scenario: Changes survive a restart
- **WHEN** a developer saves a note, stops the development pod and starts it again
- **THEN** the note holds the saved content

#### Scenario: Reset
- **WHEN** a developer deletes `.dev-pod/` and starts the development pod
- **THEN** the pod holds exactly the seed data

### Requirement: One development account owns the pod
The development pod SHALL hold one account whose email and password are fixed
and written in the repository's documentation. Its WebID SHALL have Read,
Write and Control on the seeded pod; any other agent SHALL have Read only.

#### Scenario: Logged out
- **WHEN** a visitor opens a seeded note without logging in
- **THEN** the resource's `WAC-Allow` grants the user `read` and not `write`

#### Scenario: Logged in
- **WHEN** a visitor logs in through the pod host with the development account and opens a seeded note
- **THEN** the resource's `WAC-Allow` grants the user `read` and `write`
