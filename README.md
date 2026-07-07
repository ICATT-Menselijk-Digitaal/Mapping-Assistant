# Mapping Assistant

Mapping Assistant helpt functioneel beheerders bij gemeenten om veld-voor-veld koppelingen te maken tussen bron- en doelsystemen, inclusief datatransformaties. AI-suggesties voor zowel koppelingen als transformaties binnen een koppeling versnellen het koppelproces; iedere suggestie wordt door de beheerder gecontroleerd en bevestigd voordat deze wordt toegepast.

Zie [docs/steering/VISION.md](docs/steering/VISION.md) voor meer informatie over de productvisie en doelgroep.

ICATT ontwikkelt Mapping Assistant in opdracht van Dimpact. Responsible AI is een van onze basisprincipes, samen met de uitgangspunten van de Nederlandse Digitaliseringsstrategie.

De applicatie wordt ontwikkeld aan de hand van Spec Driven Development. Epics, features, taken & bugs zijn beschreven in het Engels.

## Features

Deze codebase bestaat uit de volgende features:

- Bron- en doelschema's laden vanuit OpenAPI-specificaties
- Handmatig veldkoppelingen maken tussen bron- en doelvelden
- Transformatieregels toevoegen wanneer gekoppelde velden niet direct compatibel zijn
- AI-suggesties voor veldkoppelingen en transformaties, met vertrouwensscore
- Validatie van koppelingen (compatibel / beperkt / incompatibel)
- Koppelingsets exporteren en importeren

## Aan de slag

### Vereisten

- Node.js `^20.19.0` of `>=22.12.0`
- npm
- Een API-key van [OpenRouter](https://openrouter.ai/keys) om AI-suggesties lokaal te gebruiken

### Installatie

```bash
# Clone de repository
git clone https://github.com/ICATT-Menselijk-Digitaal/Mapping-Assistant.git
cd Mapping-Assistant/frontend

# Installeer dependencies
npm install
```

### Lokaal draaien

```bash
npm run dev
```

Voor AI-ondersteunde koppel- en transformatiesuggesties is een API-key vereist. Zie [frontend/README.md](frontend/README.md#environment-variables) voor het instellen van `VITE_OPENROUTER_API_KEY`. Zonder deze key werkt de rest van de applicatie gewoon, maar zijn AI-suggesties niet beschikbaar.

## Ontwikkelstatus

Dit project heeft de status: **in ontwikkeling**

Mapping Assistant komt voort uit een proof-of-concept en wordt momenteel doorontwikkeld richting een productierijpe applicatie.

## Licentie

Nog te bepalen.

## Contact

Naam: Martin de Bijl\
Email: martin.debijl@dimpact.nl\
Organisatie: Dimpact

Email: office@icatt.nl\
Organisatie: ICATT

## Meer informatie

- [docs/steering/VISION.md](docs/steering/VISION.md) — productvisie en doelgroep
- [docs/steering/TECH.md](docs/steering/TECH.md) — technische architectuur
- [docs/steering/QA.md](docs/steering/QA.md) — teststrategie
- [docs/glossary.md](docs/glossary.md) — begrippenlijst
