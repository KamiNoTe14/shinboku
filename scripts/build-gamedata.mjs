#!/usr/bin/env node
// Builds public/data/gamedata.json from PvPoke's open Pokémon GO game data (MIT licensed),
// and matches each species to its image ID in PokeAPI's sprite collection.
//
//   node scripts/build-gamedata.mjs                        download the latest data
//   node scripts/build-gamedata.mjs gm.json pokemon.csv    use local copies instead
//
// The output is committed to the repo so the site never depends on PvPoke being up.
// A scheduled GitHub Action reruns this weekly and commits any changes.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const SOURCE_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json";
const POKEAPI_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv";
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

async function loadText(localPath, url, label) {
  if (localPath) return readFile(localPath, "utf8");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download ${label}: HTTP ${res.status}`);
  return res.text();
}

// ---- Sprite matching ------------------------------------------------------
// PokeAPI names forms differently from PvPoke ("rattata-alola" vs "rattata_alolan").
const FORM_SUFFIXES = [
  ["_alolan", "-alola"],
  ["_galarian", "-galar"],
  ["_hisuian", "-hisui"],
  ["_paldean", "-paldea"],
];
const SPRITE_ALIASES = {
  "nidoran-female": "nidoran-f",
  "nidoran-male": "nidoran-m",
  "tauros-aqua": "tauros-paldea-aqua-breed",
  "tauros-blaze": "tauros-paldea-blaze-breed",
  "tauros-combat": "tauros-paldea-combat-breed",
  "necrozma-dawn-wings": "necrozma-dawn",
  "necrozma-dusk-mane": "necrozma-dusk",
  "zacian-crowned-sword": "zacian-crowned",
  "zamazenta-crowned-shield": "zamazenta-crowned",
  "zacian-hero": "zacian",
  "zamazenta-hero": "zamazenta",
  "calyrex-ice-rider": "calyrex-ice",
  "calyrex-shadow-rider": "calyrex-shadow",
  "minior-meteor": "minior-red-meteor",
  "minior-core": "minior-red",
  "hoopa-confined": "hoopa",
};

function spriteMatcher(csv) {
  const ids = new Map();
  for (const line of csv.trim().split("\n").slice(1)) {
    const [id, identifier] = line.split(",");
    ids.set(identifier, Number(id));
  }
  const names = [...ids.keys()];
  return (speciesId, dex) => {
    let name = speciesId;
    for (const [from, to] of FORM_SUFFIXES) name = name.replace(from, to);
    name = name.replaceAll("_", "-");
    name = SPRITE_ALIASES[name] ?? name;
    if (ids.has(name)) return ids.get(name);
    // PokeAPI sometimes gives the default form a longer name, e.g. "deoxys-normal".
    const prefixed = names.filter((n) => n.startsWith(name + "-")).map((n) => ids.get(n));
    if (prefixed.length) return Math.min(...prefixed);
    // Cosmetic forms without their own image (costumes, Arceus types) use the base image.
    return dex;
  };
}

function convert(gm, spriteId) {
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
    const img = spriteId(p.speciesId, p.dex);
    if (img !== p.dex) entry.img = img;
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
    source: "PvPoke game master (https://github.com/pvpoke/pvpoke), MIT License. Image IDs: PokeAPI.",
    sourceUpdated: gm.timestamp ?? null,
    species,
    moves,
  };
}

const [gmText, csvText] = await Promise.all([
  loadText(process.argv[2], SOURCE_URL, "PvPoke data"),
  loadText(process.argv[3], POKEAPI_CSV_URL, "PokeAPI form list"),
]);
const data = convert(JSON.parse(gmText), spriteMatcher(csvText));

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
