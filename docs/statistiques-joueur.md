# Statistiques joueur officielles

Depuis cette version, **une seule grille de statistiques joueur** est utilisée
partout sur le site (statistiques d'équipe, fiche joueur, page match, carte de
match, espace admin) :

| # | Statistique | Clé technique | Source |
|---|-------------|---------------|--------|
| 1 | Buts | `goals` | `PlayerStats.Goals` du replay |
| 2 | Passes décisives | `assists` | `PlayerStats.Assists` du replay |
| 3 | Arrêts | `saves` | `PlayerStats.Saves` du replay |
| 4 | Tirs | `shots` | `PlayerStats.Shots` du replay |
| 5 | Score | `score` | `PlayerStats.Score` du replay |
| 6 | MVP | `mvp` | déduit du replay (voir ci-dessous) |

L'ordre ci-dessus est celui affiché dans les tableaux, les comparateurs et le
formulaire admin (`src/lib/playerStats.js` → `PLAYER_STAT_KEYS`).

## Lecture des fichiers .replay

`src/lib/rocketLeagueReplay.js` décode uniquement l'en-tête du fichier
(propriétés Unreal Engine 3), sans jamais l'envoyer au serveur : seules les
valeurs extraites sont enregistrées dans le document du match.

Pour chaque joueur des deux équipes :

```
name · platform · onlineId · side (blue/orange) · bot
goals · assists · saves · shots · score · mvp
```

Ces valeurs remplacent la saisie manuelle dès qu'un replay est importé sur un
match (score, manches, joueurs et MVP sont recalculés).

## MVP

L'en-tête d'un replay Rocket League ne contient pas de champ MVP : il est
**déduit comme dans le jeu**, à savoir le meilleur score de l'équipe qui gagne
la game (départage par les buts puis les passes décisives). Voir
`replayGameMvp()`.

- Une game nulle (score identique entre les deux équipes) n'a pas de MVP.
- Un replay sans `PlayerStats` (score seul) n'a pas de MVP.
- Sur une série de games, le MVP du match est le joueur de notre équipe élu le
  plus souvent MVP (égalité départagée par le score cumulé des games en
  question). Le panel admin affiche ce MVP détecté et permet de l'appliquer au
  match en un clic.

## Rétro-compatibilité

- Les matchs enregistrés avant cette version stockaient `points` : la lecture
  retombe automatiquement sur `points` quand `score` est absent
  (`playerStatValue`), et la prochaine sauvegarde écrit `score`.
- Les replays déjà enregistrés sans indicateur `mvp` sur les joueurs sont
  recalculés à l'affichage (`isPlayerGameMvp`).
- `players[].mvp` d'un match est un **compteur** (nombre de games où le joueur a
  été élu MVP) ; sur un joueur de replay c'est un **booléen** (game unique).

## Indicateurs dérivés

`aggregatePlayer()` calcule, en plus des totaux : matchs joués, V/D/N, win rate,
moyennes par match (`goalsPerMatch`, `assistsPerMatch`, `savesPerMatch`,
`shotsPerMatch`, `scorePerMatch`), `mvpRate` (% de matchs où le joueur est MVP)
et `shotAccuracy` (buts / tirs).

## Où les statistiques sont affichées

- `/statistiques` : classement joueurs (6 colonnes), leaders par statistique,
  comparateur de deux joueurs (radar sur les 6 stats).
- `/equipe/:id` : tuiles de synthèse + tableau match par match.
- `/resultats/:id` : tableau des joueurs participants avec les 6 statistiques.
- `MatchCard` (modale) : ligne de stats par joueur du line-up.
- Admin → Matchs : saisie `Buts / Passes / Arrêts / Tirs / Score` + MVP, et
  import des replays (tableau par joueur et par game, MVP élu).
