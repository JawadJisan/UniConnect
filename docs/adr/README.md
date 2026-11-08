# Architecture decision records

An ADR records one decision with lasting consequences: what was decided, why, and what it costs. Smaller choices stay as rows in `docs/DECISIONS.md`, which the PRD and schema reference and which links to the ADRs below.

## When to write one

- A PRD open decision is confirmed in a way that changes code or schema.
- A schema change, a new dependency, or a change to the architecture in `CLAUDE.md`.
- A scope change (moving anything between V1 and V2).

## How

1. Copy `0000-template.md` to `NNNN-short-title.md`, numbered in order.
2. Fill it in and set the status to `Proposed`.
3. When the user approves it, set the status to `Accepted`, and update the matching row in `docs/DECISIONS.md` with a link.
4. Never rewrite an accepted ADR. Supersede it with a new one and mark the old one `Superseded by NNNN`.

## Index

| #   | Title | Status | Date |
| --- | ----- | ------ | ---- |
