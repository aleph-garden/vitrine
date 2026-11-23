## Purpose

Lets a view over RDF data write back its edits as an N3 Patch, computed from
the statements before and after the edit, without composing protocol text.

## ADDED Requirements

### Requirement: An edit becomes an N3 Patch
Given the quads of a document before and after an edit, the helper SHALL
produce a `text/n3` body that is a valid `solid:InsertDeletePatch`: the quads
only in the before set under `solid:deletes`, the quads only in the after set
under `solid:inserts`. Quads present in both SHALL appear in neither.

#### Scenario: Label changed
- **WHEN** the before set holds `<#me> foaf:name "Toph"` and the after set holds `<#me> foaf:name "Christopher"`
- **THEN** the patch deletes the first statement and inserts the second, and mentions no other statement

#### Scenario: No change
- **WHEN** the before and after sets hold the same quads
- **THEN** the helper reports that there is nothing to write, and produces no patch

### Requirement: Blank nodes are refused
The helper SHALL refuse an edit in which a quad that would be deleted or
inserted contains a blank node, because an N3 Patch cannot address a blank
node in the stored document. The refusal SHALL name the offending quad.

#### Scenario: Edited blank node
- **WHEN** an edit changes a statement whose subject is a blank node
- **THEN** the helper produces no patch and reports the quad it could not address

### Requirement: Only the document's own statements are patched
The helper SHALL consider only quads in the graph named by the document's IRI,
so statements a host added from outside the content, such as metadata from
response headers, never enter a patch.

#### Scenario: Metadata ignored
- **WHEN** the before set contains metadata quads in another graph that the after set lacks
- **THEN** the patch does not delete them
