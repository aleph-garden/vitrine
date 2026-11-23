## Purpose

Carries out a view's activities against a Solid server over HTTP, with the
visitor's session, and reports the server's answer as an outcome.

## ADDED Requirements

### Requirement: Versions come from ETags
When a Solid host resolves a resource, the resource's `version` SHALL be the
response's `ETag` header value, unchanged. Without an `ETag` the resource SHALL
have no `version`.

#### Scenario: ETag present
- **WHEN** the server answers a GET with `ETag: "abc"`
- **THEN** the resource's `version` is `"abc"` including the quotes

### Requirement: Activities map to HTTP requests
The adapter SHALL send:
- `as:Update` with `contentType` `text/n3` as `PATCH` to `object`;
- `as:Update` with any other `contentType` as `PUT` to `object`, with that `Content-Type` and the body;
- `as:Create` as `POST` to `target`, with the activity's `Content-Type` and body;
- `as:Delete` as `DELETE` to `object`.
An activity with `basedOn` SHALL send it as `If-Match`. Requests SHALL go
through the same fetch the host reads that origin with, so a credentialed
origin receives the session's credentials and any other origin none.

#### Scenario: Markdown saved
- **WHEN** a view acts with `as:Update`, `contentType: 'text/markdown'`, a body and `basedOn: '"abc"'`
- **THEN** the server receives `PUT` with `Content-Type: text/markdown`, `If-Match: "abc"` and the body

#### Scenario: RDF patched
- **WHEN** a view acts with `as:Update` and `contentType: 'text/n3'`
- **THEN** the server receives `PATCH` with `Content-Type: text/n3`

#### Scenario: Foreign origin
- **WHEN** a view acts on an IRI whose origin is not credentialed for the session
- **THEN** the request carries no session credentials

### Requirement: Responses map to outcomes
A 2xx response SHALL yield `{ ok: true }` with `iri` set to the `Location`
header for `as:Create` and to `object` otherwise, and `version` set to the
response's `ETag` when present. Status 401 and 403 SHALL yield `denied`; 409
and 412 `conflict`; 400 and 422 `invalid`; 405, 415 and 501 `unsupported`. Any
other status, and a network failure, SHALL reject the `act` call with an error
carrying the status when there is one.

#### Scenario: Precondition failed
- **WHEN** the server answers 412
- **THEN** `act` resolves to `{ ok: false, reason: 'conflict' }`

#### Scenario: Created resource
- **WHEN** the server answers a `POST` with 201 and `Location: https://pod.example/inbox/x`
- **THEN** `act` resolves to `{ ok: true, iri: 'https://pod.example/inbox/x' }`

#### Scenario: Server error
- **WHEN** the server answers 500
- **THEN** the `act` call rejects with an error whose `status` is 500

### Requirement: The resolve cache drops a changed resource
After a successful activity the host SHALL drop its cached answer for the
changed IRI, and for `as:Create` and `as:Delete` also for the containing
collection, before the refresh renders.

#### Scenario: Re-render after save
- **WHEN** an update to a resource succeeds and the runtime renders it again
- **THEN** the host fetches the resource from the server instead of answering from its cache
