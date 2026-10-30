import {
  REPLAY_SIDE_LABELS,
  autoLinkReplayPlayers,
  buildReplaySeries,
  formatReplayDuration,
  listReplayPlayers,
  parseRocketLeagueReplay,
  sortReplayGames,
  suggestReplaySide,
  unlinkPlayersOutsideSide,
} from "./rocketLeagueReplay.js";

export {
  REPLAY_SIDE_LABELS,
  autoLinkReplayPlayers,
  buildReplaySeries,
  formatReplayDuration,
  listReplayPlayers,
  parseRocketLeagueReplay,
  sortReplayGames,
  suggestReplaySide,
};

const toNonNegInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
};

/**
 * Décode un Buffer Node.js de fichier `.replay` Rocket League.
 */
export const parseReplayBuffer = (buffer, fileName = "") => {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  return parseRocketLeagueReplay(arrayBuffer, fileName);
};

/**
 * Détermine automatiquement la bonne couleur ("blue" ou "orange") pour Elysium,
 * relie les pseudos des replays aux fiches joueurs du site (via pseudo principal + `/link`),
 * et calcule toutes les données de match à publier sur le site.
 *
 * Règles métier respectées :
 * 1. Si une couleur donne exactement le score déclaré (ex: 4 Elysium - 1 Adversaire), on la choisit ;
 *    si c'est l'inverse (1 - 4), on inverse automatiquement la couleur.
 * 2. Si les scores ne sont pas exactement identiques (ex: replay en double / remake),
 *    on choisit la couleur qui donne la victoire à la bonne équipe (celle déclarée gagnante).
 * 3. Si malgré tout les replays aboutissent à une égalité alors qu'un vainqueur a été déclaré,
 *    on conserve le score déclaré pour garantir que la victoire aille à la bonne équipe.
 */
export const resolveReplaySideAndSeries = ({
  games = [],
  declaredScoreUs = 0,
  declaredScoreThem = 0,
  members = [],
} = {}) => {
  const usDecl = toNonNegInt(declaredScoreUs);
  const themDecl = toNonNegInt(declaredScoreThem);

  // Dédoublonnage des fichiers strictement identiques (même replayId UE3) + tri chronologique
  const seenIds = new Set();
  const deduped = [];
  let duplicateIdsRemoved = 0;

  for (const game of games) {
    if (!game) continue;
    if (game.replayId && seenIds.has(game.replayId)) {
      duplicateIdsRemoved += 1;
      continue;
    }
    if (game.replayId) seenIds.add(game.replayId);
    deduped.push(game);
  }

  const sortedGames = sortReplayGames(deduped);

  if (sortedGames.length === 0) {
    return {
      hasReplays: false,
      side: "",
      sideLabel: "",
      replays: [],
      scoreUs: usDecl,
      scoreThem: themDecl,
      maps: [],
      players: [],
      mvp: "",
      mvpDetails: null,
      warnings: [],
      duplicateIdsRemoved,
    };
  }

  const blueSeries = buildReplaySeries(sortedGames, "blue");
  const orangeSeries = buildReplaySeries(sortedGames, "orange");
  const suggestedByRoster = suggestReplaySide(sortedGames, members);

  const blueExact = blueSeries.scoreUs === usDecl && blueSeries.scoreThem === themDecl;
  const orangeExact = orangeSeries.scoreUs === usDecl && orangeSeries.scoreThem === themDecl;

  let chosenSide = "";

  // 1) Correspondance exacte du score déclaré (inversion auto si nécessaire)
  if (blueExact && !orangeExact) {
    chosenSide = "blue";
  } else if (orangeExact && !blueExact) {
    chosenSide = "orange";
  } else if (usDecl > themDecl) {
    // 2a) Elysium a gagné selon le score déclaré : choisir la couleur victorieuse
    if (blueSeries.scoreUs > blueSeries.scoreThem) chosenSide = "blue";
    else if (orangeSeries.scoreUs > orangeSeries.scoreThem) chosenSide = "orange";
  } else if (usDecl < themDecl) {
    // 2b) L'adversaire a gagné selon le score déclaré : choisir la couleur perdante pour nous
    if (blueSeries.scoreUs < blueSeries.scoreThem) chosenSide = "blue";
    else if (orangeSeries.scoreUs < orangeSeries.scoreThem) chosenSide = "orange";
  }

  // 3) Repli sur la détection des pseudos/alias des joueurs du site, sinon "blue"
  if (!chosenSide) {
    chosenSide = suggestedByRoster || "blue";
  }

  // Liaison automatique des joueurs de notre équipe (pseudo site + pseudos /link)
  const cleanGames = unlinkPlayersOutsideSide(sortedGames, chosenSide);
  const linkedGames = autoLinkReplayPlayers(cleanGames, members, chosenSide);
  const finalSeries = buildReplaySeries(linkedGames, chosenSide);

  let finalScoreUs = finalSeries.scoreUs;
  let finalScoreThem = finalSeries.scoreThem;

  // Garde-fou : si un replay en double crée une égalité de manches alors qu'une équipe a gagné,
  // on applique le score déclaré pour être certain d'attribuer la victoire à la bonne équipe.
  if (usDecl > themDecl && !(finalScoreUs > finalScoreThem)) {
    finalScoreUs = usDecl;
    finalScoreThem = themDecl;
  } else if (usDecl < themDecl && !(finalScoreUs < finalScoreThem)) {
    finalScoreUs = usDecl;
    finalScoreThem = themDecl;
  }

  const mvpString = finalSeries.mvp
    ? finalSeries.mvp.playerId || finalSeries.mvp.pseudo || finalSeries.mvp.name || ""
    : "";

  return {
    hasReplays: true,
    side: chosenSide,
    sideLabel: REPLAY_SIDE_LABELS[chosenSide] || chosenSide,
    replays: linkedGames,
    scoreUs: finalScoreUs,
    scoreThem: finalScoreThem,
    replayScoreUs: finalSeries.scoreUs,
    replayScoreThem: finalSeries.scoreThem,
    maps: finalSeries.maps,
    players: finalSeries.players,
    mvp: mvpString,
    mvpDetails: finalSeries.mvp,
    warnings: finalSeries.warnings,
    duplicateIdsRemoved,
  };
};
