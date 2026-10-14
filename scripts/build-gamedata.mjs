#!/usr/bin/env node
// Builds public/data/gamedata.json from PvPoke's open Pokémon GO game data (MIT licensed).
//
//   node scripts/build-gamedata.mjs            download the latest data from PvPoke
//   node scripts/build-gamedata.mjs file.json  use a local copy instead
//
// The output is committed to the repo so the site never depends on PvPoke being up.
// A scheduled GitHub Action reruns this weekly and commits any changes.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const SOURCE_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json";
const OUT = new URL("../public/data/gamedata.json", import.meta.url);

const KEEP_TAGS = new Set([
  "legendary",
  "mythical",
  "ultrabeast",
  "regional",
  "starter",
  "untradeable",
  "alolan",
  "galarian",
  "hisuian",
  "paldean",
]);

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

async function loadSource() {
  const local = process.argv[2];
  if (local) return JSON.parse(await readFile(local, "utf8"));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Couldn't download PvPoke data: HTTP ${res.status}`);
  return res.json();
}

function convert(gm) {
  const shadowEligible = new Set();
  for (const p of gm.pokemon) {
    if (p.tags?.includes("shadow")) shadowEligible.add(p.speciesId.replace(/_shadow$/, ""));
    if (p.tags?.includes("shadoweligible")) shadowEligible.add(p.speciesId);
  }

  const species = [];
  for (const p of gm.pokemon) {
    const tags = p.tags ?? [];
    // Shadow is a property of an individual Pokémon, not a separate species.
    if (tags.includes("shadow")) continue;
    // PvPoke's duplicate size variants of Pumpkaboo/Gourgeist.
    if (tags.includes("teambuilderexclude")) continue;

    const isMega = tags.includes("mega") || /_primal$/.test(p.speciesId);
    const entry = {
      id: p.speciesId,
      name: p.speciesName,
      dex: p.dex,
      types: p.types.filter((t) => t !== "none").map(titleCase),
      atk: p.baseStats.atk,
      def: p.baseStats.def,
      sta: p.baseStats.hp,
      fast: p.fastMoves,
      charged: p.chargedMoves,
      family: p.family?.id ?? null,
    };
    if (p.eliteMoves?.length) entry.elite = p.eliteMoves;
    if (p.legacyMoves?.length) entry.legacy = p.legacyMoves;
    if (p.family?.parent) entry.parent = p.family.parent;
    if (p.family?.evolutions?.length) entry.evolutions = p.family.evolutions;
    if (shadowEligible.has(p.speciesId) && !isMega) entry.shadow = true;
    if (isMega) entry.mega = true;
    if (p.released === false) entry.unreleased = true;
    if (p.buddyDistance) entry.buddyKm = p.buddyDistance;
    if (p.thirdMoveCost) entry.thirdMoveDust = p.thirdMoveCost;
    const kept = tags.filter((t) => KEEP_TAGS.has(t));
    if (kept.length) entry.tags = kept;
    species.push(entry);
  }

  species.sort((a, b) => a.dex - b.dex || a.name.localeCompare(b.name));

  const moves = {};
  for (const m of gm.moves) {
    moves[m.moveId] = {
      name: m.name,
      type: titleCase(m.type),
      // Battle League (PvP) values. Raid (PvE) values come from a separate source later.
      pvp: m.energyGain > 0
        ? { power: m.power, energyGain: m.energyGain, turns: m.turns ?? 1 }
        : { power: m.power, energy: m.energy },
    };
  }

  return {
    source: "PvPoke game master (https://github.com/pvpoke/pvpoke), MIT License",
    sourceUpdated: gm.timestamp ?? null,
    species,
    moves,
  };
}

const data = convert(await loadSource());

// Leave the file untouched when nothing but the timestamp changed, so the weekly job
// doesn't create empty commits.
let previous = null;
try {
  previous = JSON.parse(await readFile(OUT, "utf8"));
} catch {}
const sameContent =
  previous &&
  JSON.stringify({ ...previous, sourceUpdated: null }) === JSON.stringify({ ...data, sourceUpdated: null });

if (sameContent) {
  console.log("Game data unchanged.");
} else {
  await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(data));
  console.log(
    `Wrote ${data.species.length} species and ${Object.keys(data.moves).length} moves (source updated ${data.sourceUpdated}).`,
  );
}
