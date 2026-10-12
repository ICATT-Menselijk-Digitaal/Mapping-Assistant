# Changelog

- Inspect enum field constraints in the schema panel: enum fields display an "enum" tag alongside their base type (e.g. "string") instead of the generic "obj" tag, are not expandable, and expose their allowed values as "Can contain '…', '…'" in the collapsible description section — alone when the field has no own description, or below it otherwise ([#181](https://github.com/ICATT-Menselijk-Digitaal/Mapping-Assistant/issues/181))
- Add a comment to a Koppeling: record a short, timestamped note from its detail view, see a row-level indicator with a hover preview in the Koppelingen paneel, filter the paneel to only Koppelingen with a comment, and have the comment carried through export/import ([#161](https://github.com/ICATT-Menselijk-Digitaal/Mapping-Assistant/issues/161))
- Filter the Koppelingen paneel by resolution status (Alle / Actie vereist), combined with the existing field-name search ([#142](https://github.com/ICATT-Menselijk-Digitaal/Mapping-Assistant/issues/142))
