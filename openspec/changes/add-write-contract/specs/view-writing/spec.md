## Purpose

Lets a view ask its host to change a resource, and learn whether the change
landed, without the view knowing which protocol or store the host speaks.

## ADDED Requirements

### Requirement: A view requests a change through the context
The view context SHALL offer `act(activity)`. An activity is an ActivityStreams
activity whose `type` is `as:Update`, `as:Create` or `as:Delete`, with an
optional `contentType`, an optional `body` as text or bytes, and an optional
`basedOn` version. `as:Update` and `as:Delete` name the resource in `object`;
`as:Create` names the collection in `target`. `act` SHALL resolve to an outcome
and SHALL NOT reject for a refusal the host can name.

#### Scenario: Update carried out
- **WHEN** a view calls `act` with `as:Update`, an `object` IRI, a `contentType` and a `body`, and the host stores it
- **THEN** `act` resolves to `{ ok: true, iri }` with `iri` equal to the `object`, plus the new `version` when the host issues one

#### Scenario: Create answers the new resource's IRI
- **WHEN** a view calls `act` with `as:Create`, a `target` collection IRI and a body, and the host creates the resource
- **THEN** `act` resolves to `{ ok: true, iri }` with `iri` naming the created resource

#### Scenario: Delete carried out
- **WHEN** a view calls `act` with `as:Delete` and an `object` IRI, and the host removes it
- **THEN** `act` resolves to `{ ok: true, iri }` with `iri` equal to the `object`

### Requirement: A refused change names its reason
When the host does not carry out an activity, `act` SHALL resolve to
`{ ok: false, reason }` where `reason` is one of `denied` (the requester lacks
the access mode), `conflict` (the resource changed since `basedOn`, or the
change does not apply to its current state), `invalid` (the body was rejected
as malformed or as failing validation) and `unsupported` (the host cannot carry
out this activity or media type). The host MAY attach a `detail` resource, such
as a validation report.

#### Scenario: Stale version
- **WHEN** a view calls `act` with a `basedOn` version that is no longer current
- **THEN** `act` resolves to `{ ok: false, reason: 'conflict' }` and the resource is unchanged

#### Scenario: Host without write support
- **WHEN** a view calls `act` in a context whose host carries out no writes, including server-side rendering
- **THEN** `act` resolves to `{ ok: false, reason: 'unsupported' }`

#### Scenario: Validation report attached
- **WHEN** the host rejects a body and its answer carries a validation report
- **THEN** the outcome is `{ ok: false, reason: 'invalid', detail }` with `detail` a resource a view can render

### Requirement: A resource carries an opaque version
A resource MAY carry a `version` string the host issued. The core SHALL pass it
through unread: it SHALL NOT parse, compare or construct versions. A host
without versions SHALL leave the field out, and its writes are last write
wins.

#### Scenario: Version round trip
- **WHEN** a view reads a resource with a `version` and sends an activity with that value as `basedOn`
- **THEN** the host receives exactly that value

#### Scenario: No version available
- **WHEN** a host resolves a resource for which it has no version
- **THEN** the resource has no `version` field, and an activity without `basedOn` is carried out unconditionally

### Requirement: A successful change refreshes every instance of the resource
After the host carried out an activity, the runtime SHALL emit `as:Update` with
the changed IRI as `object` (for `as:Create`, the target collection as well),
and every mounted instance that resolved that IRI SHALL render again from a
fresh resolve.

#### Scenario: Two regions show one note
- **WHEN** an update to a note succeeds through one region while a second region shows the same note
- **THEN** both regions render the stored content, and neither serves the content from before the write

#### Scenario: Refused change leaves the page alone
- **WHEN** `act` resolves with `ok: false`
- **THEN** no `as:Update` is emitted and no instance renders again

### Requirement: A view offers editing only with write access
A view SHALL render controls that change a resource only when the resource's
`allow` contains `write`, or `append` for an `as:Create`. The host SHALL still
decide each activity itself, since access can change between read and write.

#### Scenario: Read-only visitor
- **WHEN** a resource's `allow` lacks `write`
- **THEN** a view renders no control that would call `act` with `as:Update` for it

#### Scenario: Access revoked after reading
- **WHEN** a view calls `act` after the requester lost write access
- **THEN** `act` resolves to `{ ok: false, reason: 'denied' }`
