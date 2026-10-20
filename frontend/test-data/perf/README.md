# Performance test datasets

Large coupling sets (*koppelingssets*) for measuring field hover performance (Feature #195). Both are normal export files with the schemas inline, so they load through the **Import** button without any network access.

| File | Source schema | Target schema | Couplings |
|---|---|---|---|
| `generated.koppelingsset.json` | 500 generated fields in 10 objects (with nested objects) | 500 generated fields | 355, including one source field coupled to 60 targets and 5 source-less couplings |
| `det-openzaak.koppelingsset.json` | e-Suite Data Extractie Tool (DET), GET responses: 1,233 fields | OpenZaak Zaken API, POST requests: 394 fields | 350, generated (same-named fields first) |

## Regenerate

From `frontend/`:

```bash
npm run perf:datasets
```

The generator (`scripts/perf/generate-datasets.ts`) uses the app's own OpenAPI parser, coupling rules and exporter. Re-run it after a change to the export format so the files keep matching what the app exports.

## Measure

From `frontend/`:

```bash
npm run perf:hover
```

This builds the app, imports each dataset in headless Google Chrome, moves the mouse over 120 field rows and reports how long each hover takes until the highlight is painted (Chrome's Event Timing), at 1× and 4× CPU throttling. Set `PERF_CPU_THROTTLE` (e.g. `1,4,6`) or `PERF_BROWSER_CHANNEL` (e.g. `msedge`) to change this.

## Sources and licence

The real schemas are snapshots of public OpenAPI specs, pinned to a commit in the generator. Both are licensed under the EUPL:

- DET: [NL-AMS-LOCGOV/esuite-data-extractie](https://github.com/NL-AMS-LOCGOV/esuite-data-extractie) (`openapi-spec/OpenAPI.yaml`), EUPL-1.2-or-later
- OpenZaak Zaken API: [open-zaak/open-zaak](https://github.com/open-zaak/open-zaak) (`src/openzaak/components/zaken/openapi.yaml`), EUPL
