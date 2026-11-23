## Purpose

Lets a visitor with write access edit a Markdown note's source in the browser
and save it to the resource it came from.

## ADDED Requirements

### Requirement: The note's source is editable
An edit view for `text/markdown` resources SHALL show the resource's full
source, including frontmatter, in a text field, and SHALL be selectable like
any view, by `show.view` or a rule.

#### Scenario: Open the editor
- **WHEN** a Markdown note is shown with the edit view
- **THEN** the text field holds the note's source exactly as stored

### Requirement: The reading view leads to the editor
The Markdown reading view SHALL offer a control that shows the same note with
the edit view when the resource's `allow` contains `write`, and SHALL offer
none otherwise.

#### Scenario: Owner reads a note
- **WHEN** a visitor with write access reads a note
- **THEN** the view offers the control to edit it

#### Scenario: Guest reads a note
- **WHEN** a visitor without write access reads a note
- **THEN** the view offers no control to edit it

### Requirement: Saving writes the source through the context
Saving SHALL call `act` with `as:Update`, the note's IRI as `object`,
`contentType: 'text/markdown'`, the text field's content as `body`, and the
version the editor was opened with as `basedOn`.

#### Scenario: Save succeeds
- **WHEN** the visitor saves and `act` resolves with `ok: true`
- **THEN** the stored note holds the edited source and the editor continues from the new version

#### Scenario: Save meets a newer version
- **WHEN** the visitor saves and `act` resolves with `reason: 'conflict'`
- **THEN** the editor keeps the unsaved text and tells the visitor that the note changed elsewhere

#### Scenario: Save refused
- **WHEN** `act` resolves with `denied`, `invalid` or `unsupported`
- **THEN** the editor keeps the unsaved text and names the reason

### Requirement: Unsaved text survives a re-render
Text typed into the editor and not yet saved SHALL survive a re-render of the
instance, including one caused by an `as:Update` for the same note from
elsewhere.

#### Scenario: Note changed in another region
- **WHEN** the visitor has unsaved text and another region saves the same note
- **THEN** the editor keeps the unsaved text, and a following save resolves with `conflict`
