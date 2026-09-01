# Glossary

Domain terms used across the Mapping Assistant's specs and issues. See `docs/steering/VISION.md` for the full Bounded Context breakdown — this glossary tracks terms as they're introduced or refined by individual Epics/Features.

## Core actors

- **Technical administrator** — the product's primary actor (see `docs/steering/VISION.md`). Dutch UI term: **functioneel beheerder**.

## AI assistance

- **Suggestion scope** — the set of schema objects an administrator chooses to include before running an AI suggestion pass, used to keep suggestion runs usable against real-world-sized schemas instead of relying on a hard field cap. Introduced in [#82](../../issues/82).
- **Suggestion reasoning** — the written rationale an AI suggestion (mapping or transformation) includes for why it was proposed, shown alongside its confidence score. Introduced in [#82](../../issues/82).
- **Validation rule** — a semantic constraint on a field's value (e.g. a format or pattern) that's implied by its free-text description but not declared in its schema properties (data type, max length, required). Only actionable once a field is part of a mapped pair — not a standalone, reviewable AI suggestion; referenced within transformation suggestion reasoning when relevant. Introduced in [#82](../../issues/82), scoped down from an earlier, more complex design.
- **Suggestion cost** — the cost and token usage recorded for a single AI suggestion call (mapping or transformation), sourced from the LLM provider's per-request usage data. Introduced in [#83](../../issues/83).
- **Model comparison report** — an internal report comparing suggestion cost (and, where available, acceptance rate) across the different LLMs available through OpenRouter, used to inform a production model choice. Introduced in [#83](../../issues/83).

## Schema fields

- **Container field** — a schema field that only groups other fields (e.g. "Zaak" or "initiator") and has no mappable value of its own. Never mappable directly, and never eligible as an AI suggestion candidate — only its leaf fields are. Introduced in [#87](../../issues/87).

## Coupling

- **Coupling** — the pairing of a source field with a target field, along with any transformation rules that reconcile them. Modelled in code as `FieldMapping`; UI already refers to it as *koppeling* (e.g. `CouplingDetailPanel`). A future refactor will align the code type name with this term.
- **Mapping side** — either endpoint of a coupling: the *source* (fields being mapped from) or the *target* (fields being mapped to). Encoded in code as `MappingSide = 'source' | 'target'`. Introduced during the schema-side composable refactor (no issue).
- **Field pair analysis** — the per-coupling result of `analyze(source, target)`: a `status` (`compatible` | `constrained` | `incompatible`) plus the list of mismatches that still need a transformation rule. Status is derived from mismatches so the two can never disagree — a change from the earlier split where date→date could report `compatible` and a `date-format` mismatch at the same time. Introduced during the coupling-module refactor (no issue).

## Trial environment

- **Trial visitor** — someone trying out the Mapping Assistant on the public test environment, typically a dev-team contact rather than the general public. Distinct from the product's primary actor, the Technical administrator. Provides their own AI provider API key rather than using a team-managed one. Introduced in [#84](../../issues/84).

