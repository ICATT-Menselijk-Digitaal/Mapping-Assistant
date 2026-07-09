---
name: Feature
about: A user-facing capability within an Epic
title: "🚀 Feature: "
labels: feature
assignees: ""
---

# 🚀 Feature: {{title}}

## Bounded Context

---

## User Stories

<!-- Written by Product Owner -->

- As a **_, I want _** so that \_\_\_

## Design Handoff

<!-- Link Figma frames, component specs, or annotated mockups -->

- Figma:
- States covered: (default / loading / error / empty)
- Accessibility notes:

---

## Acceptance Criteria

<!-- These directly feed into Gherkin scenarios in child Tasks. One AC → one or more scenarios. -->

- [ ]

## Edge Cases

## <!-- Explicitly name them here so Tasks can cover them in Gherkin. Use domain language. -->

## Domain Events

<!-- Events this feature emits or consumes. Use past-tense domain names (e.g. OrderPlaced, PaymentSettled). -->

- Emits:
- Consumes:

---

## Definition of Ready

<!-- This feature is ready to be broken into Tasks when: -->

- [ ] User stories agreed by PO
- [ ] Design handoff complete
- [ ] Acceptance criteria written and reviewed
- [ ] Edge cases identified

---

## Proposed Tasks

<!-- Link task issues as they are created -->

- [ ]

---

## Feature Completion Checklist

<!-- Each item is "if applicable" — skip items that don't apply, but document why. Source: docs/steering/QA.md -->

- [ ] **Changelog** — An entry has been added to the top of `CHANGELOG.md` with the feature/bug name and a link to the GitHub issue. If there are new environment variables or other upgrade-relevant changes, they are mentioned here.
- [ ] **Readme** — README(s) updated with information on how to install, configure, and run the application locally, including any new environment variables.
- [ ] **User secrets** — User secrets in 1Password have been added/updated.
- [ ] **Decision record** — Any significant functional/product decision has been added to `docs/decision-record.md` (in Dutch).
- [ ] **Cleanup** — Branches, test data, and temporary copies of databases/files have been cleaned up.
- [ ] **UX** — Significant design changes have been checked with a UX specialist.
- [ ] **Test documentation** — Regression test scenarios not covered by automated tests, known issues, and things deliberately not tested are documented in `docs/steering/QA.md`'s Known Issues section.
