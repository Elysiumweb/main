# Import d'un planning .ics (managers)

Depuis **Espace joueur → Planning**, un manager (ou le bureau) peut remplir
automatiquement le calendrier d'un roster à partir d'un fichier `.ics` exporté
d'un autre agenda (Google Agenda, Outlook, FFR, etc.).

## Utilisation

1. Onglet **Calendrier** → bouton **Importer un .ics** (à côté de « Nouvel événement »).
2. Déposer le fichier (ou cliquer pour le choisir) — 2 Mo maximum.
3. Choisir le **pôle** et le **roster** cible. Le roster est obligatoire pour un
   pôle qui possède des rosters (même règle que la création manuelle).
4. Régler l'**horizon** (30, 90, 180 ou 365 jours) et la couleur des séances
   (voir « Couleurs » ci-dessous).
5. Vérifier l'**aperçu**, puis valider : chaque séance devient un événement du
   planning, identique à un événement créé à la main (présent/absent compris).

## Ce qui est repris

- Événements ponctuels, journées entières et événements avec fuseau horaire
  (`TZID`, UTC ou heure locale).
- Récurrences `RRULE` : quotidienne, hebdomadaire (`BYDAY`), mensuelle et
  annuelle, avec `INTERVAL`, `COUNT`, `UNTIL`.
- `EXDATE` (occurrences retirées), `RDATE` (occurrences ajoutées) et
  `RECURRENCE-ID` (occurrence déplacée).
- `DURATION` quand `DTEND` est absent.

## Couleurs

Les couleurs du fichier sont reprises par défaut :

- `COLOR` sur un `VEVENT` (RFC 7986) — c'est la couleur propre à l'événement.
- `X-APPLE-CALENDAR-COLOR` / `X-WR-CALCOLOR` / `COLOR` sur le `VCALENDAR` —
  couleur du calendrier, appliquée aux événements qui n'en ont pas.

Formats acceptés : `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()`/`rgba()` et noms CSS
(`red`, `teal`, `DarkSlateBlue`…). Une couleur illisible est ignorée.

Dans la fenêtre d'import, un bloc **« Utiliser les couleurs du fichier »**
(casé par défaut) affiche la palette détectée et, dans l'aperçu, la pastille de
chaque séance. Si on le décoche, ou si le fichier ne contient aucune couleur,
les séances prennent la **couleur par défaut** choisie dans la modale (celle du
pôle par défaut).

Les teintes trop sombres (noir, bleu nuit) sont automatiquement éclaircies pour
que le titre reste lisible sur le planning noir ; la teinte d'origine est
conservée.

## Limites volontaires

- Seules les séances **à venir** sont importées (l'horizon part d'aujourd'hui).
- Plafond de **300 séances** par import : réduire l'horizon pour importer une
  autre période.
- Les règles non gérées (`BYSETPOS`, `BYWEEKNO`, `FREQ=HOURLY`, mensuel avec
  ordinal type `2TU`…) n'importent que leur **première occurrence** ; un
  avertissement s'affiche dans l'aperçu.
- Un événement **annulé** (`STATUS:CANCELLED`) est ignoré.
- Les séances déjà planifiées (même titre, même début, même pôle/roster) sont
  ignorées pour éviter les doublons.

Le code de lecture/expansion vit dans `src/lib/icsImport.js` (sans dépendance
externe) et est couvert par `src/lib/icsImport.test.js`.
