#!/usr/bin/env node
// Builds public/data/gamedata.json from PvPoke's open Pokémon GO game data and league
// rankings (MIT licensed), and matches each species to its image ID in PokeAPI's sprite
// collection.
//
//   node scripts/build-gamedata.mjs                  download the latest data
//   node scripts/build-gamedata.mjs --from DIR       use local copies in DIR instead
//                                                    (gamemaster.json, pokemon.csv,
//                                                    rankings-1500.json, rankings-2500.json,
//                                                    game-master.json)
//
// Raid move stats, evolution costs, power-up costs, the type chart and weather boosts
// come from the raw Pokémon GO game master published by PokeMiners. That repository has
// no license (the data is Niantic's); only factual numbers are taken from it.
//
// The output is committed to the repo so the site never depends on PvPoke being up.
// A scheduled GitHub Action reruns this weekly and commits any changes.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const SOURCE_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json";
const POKEAPI_CSV_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv";
const RAW_GM_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json";
const RANKINGS_URL = (cap) =>
  `https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-${cap}.json`;
// Great League and Ultra League. Master League has no CP cap, so IV rank there is just IV %.
const LEAGUES = { gl: 1500, ul: 2500 };
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

const fromIdx = process.argv.indexOf("--from");
const LOCAL_DIR = fromIdx !== -1 ? process.argv[fromIdx + 1] : null;

async function loadText(localName, url, label) {
  if (LOCAL_DIR) return readFile(`${LOCAL_DIR}/${localName}`, "utf8");
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

/**
 * League rankings: each species' position in PvPoke's overall ranking for a league
 * (1 = best). Shadow forms are ranked separately, e.g. "machamp_shadow".
 */
function leagueRanks(rankingsByLeague) {
  const out = new Map();
  for (const [league, list] of Object.entries(rankingsByLeague)) {
    list.forEach((entry, i) => {
      const r = out.get(entry.speciesId) ?? {};
      r[league] = i + 1;
      out.set(entry.speciesId, r);
    });
  }
  return out;
}


// ---- Raw game master (raids, evolutions, costs) ----------------------------
const TYPE_ORDER = [
  "Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel",
  "Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy",
];
const typeName = (t) => titleCase(t.replace("POKEMON_TYPE_", "").toLowerCase());
const MOVE_ALIASES = { FUTURE_SIGHT: "FUTURESIGHT" };
const REGION_TOKENS = { alolan: "ALOLA", galarian: "GALARIAN", hisuian: "HISUIAN", paldean: "PALDEA" };
const ITEM_NAMES = {
  ITEM_SUN_STONE: "Sun Stone",
  ITEM_KINGS_ROCK: "King's Rock",
  ITEM_METAL_COAT: "Metal Coat",
  ITEM_DRAGON_SCALE: "Dragon Scale",
  ITEM_UP_GRADE: "Up-Grade",
  ITEM_GEN4_EVOLUTION_STONE: "Sinnoh Stone",
  ITEM_GEN5_EVOLUTION_STONE: "Unova Stone",
  ITEM_TROY_DISK_GLACIAL: "Glacial Lure Module",
  ITEM_TROY_DISK_MAGNETIC: "Magnetic Lure Module",
  ITEM_TROY_DISK_MOSSY: "Mossy Lure Module",
  ITEM_TROY_DISK_RAINY: "Rainy Lure Module",
};

function readRawGameMaster(raw) {
  const movesByName = new Map();
  const pokemonByDex = new Map();
  const typeChart = {};
  const weather = {};
  let upgrade = null;
  let battle = null;
  let weatherBonus = null;

  for (const entry of raw) {
    const id = entry.templateId;
    const d = entry.data ?? {};
    let m;
    if ((m = id.match(/^V\d{4}_MOVE_(.+)$/)) && d.moveSettings) {
      movesByName.set(m[1], d.moveSettings);
    } else if ((m = id.match(/^V(\d{4})_POKEMON_(.+)$/)) && d.pokemonSettings) {
      const dex = Number(m[1]);
      pokemonByDex.set(dex, [...(pokemonByDex.get(dex) ?? []), { name: m[2], s: d.pokemonSettings }]);
    } else if (d.typeEffective) {
      const atk = typeName(d.typeEffective.attackType);
      const row = {};
      d.typeEffective.attackScalar.forEach((v, i) => {
        if (v !== 1) row[TYPE_ORDER[i]] = v;
      });
      typeChart[atk] = row;
    } else if (d.weatherAffinities) {
      weather[d.weatherAffinities.weatherCondition] = d.weatherAffinities.pokemonType.map(typeName);
    } else if (d.pokemonUpgrades) {
      upgrade = d.pokemonUpgrades;
    } else if (d.battleSettings) {
      battle = d.battleSettings;
    } else if (d.weatherBonusSettings) {
      weatherBonus = d.weatherBonusSettings;
    }
  }

  const pveMove = (moveId) => {
    const ms =
      movesByName.get(moveId) ??
      movesByName.get(`${moveId}_FAST`) ??
      movesByName.get(MOVE_ALIASES[moveId]) ??
      (moveId.startsWith("HIDDEN_POWER_") ? movesByName.get("HIDDEN_POWER_FAST") : undefined);
    if (!ms) return null;
    return { power: ms.power ?? 0, energy: ms.energyDelta ?? 0, durationMs: ms.durationMs };
  };

  // Find the game master entry for one of PvPoke's species: same dex number and base
  // stats, preferring the matching regional form and the plain (non-costume) entry.
  const entryFor = (sp) => {
    const all = pokemonByDex.get(sp.dex) ?? [];
    const same = all.filter(
      ({ s }) => s.stats?.baseAttack === sp.atk && s.stats?.baseDefense === sp.def && s.stats?.baseStamina === sp.sta,
    );
    const pool = same.length ? same : all;
    const tokens = Object.entries(REGION_TOKENS).filter(([k]) => sp.id.includes(k)).map(([, v]) => v);
    const score = ({ name }) =>
      (tokens.length ? (tokens.every((t) => name.includes(t)) ? 10 : -10) : 0) +
      (name.endsWith("_NORMAL") ? 3 : 0) +
      (name.includes("_") ? 0 : 2) -
      (name.match(/_/g)?.length ?? 0) * 0.1;
    return pool.length ? pool.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
  };

  const evolutionCost = (from, to) => {
    const a = entryFor(from);
    const b = entryFor(to);
    if (!a || !b) return null;
    let branches = (a.s.evolutionBranch ?? []).filter((x) => x.evolution === b.s.pokemonId);
    if (branches.length > 1) {
      const byForm = branches.filter((x) => x.form === b.s.form);
      if (byForm.length) branches = byForm;
    }
    const br = branches[0];
    if (!br || br.candyCost === undefined) return null;
    const out = { candy: br.candyCost };
    if (br.candyCostPurified) out.candyPurified = br.candyCostPurified;
    if (br.evolutionItemRequirement) out.item = ITEM_NAMES[br.evolutionItemRequirement] ?? "a special evolution item";
    if (br.lureItemRequirement) out.item = ITEM_NAMES[br.lureItemRequirement] ?? "a special Lure Module";
    if (br.mustBeBuddy || br.kmBuddyDistanceRequirement) out.buddyKm = br.kmBuddyDistanceRequirement ?? 0;
    if (br.questDisplay?.length) out.quest = true;
    if (br.onlyDaytime) out.time = "day";
    if (br.onlyNighttime) out.time = "night";
    if (br.noCandyCostViaTrade) out.tradeFree = true;
    return out;
  };

  return {
    pveMove,
    evolutionCost,
    typeChart,
    weather,
    raid: {
      stab: battle?.sameTypeAttackBonusMultiplier ?? 1.2,
      shadowAtk: battle?.shadowPokemonAttackBonusMultiplier ?? 1.2,
      shadowDef: battle?.shadowPokemonDefenseBonusMultiplier ?? 0.8333333,
      energyPerHpLost: battle?.energyDeltaPerHealthLost ?? 0.5,
      weatherBoost: weatherBonus?.attackBonusMultiplier ?? 1.2,
    },
    upgrade: upgrade && {
      stardust: upgrade.stardustCost,
      candy: upgrade.candyCost,
      xl: upgrade.xlCandyCost,
      shadowMultiplier: upgrade.shadowStardustMultiplier,
      purifiedMultiplier: upgrade.purifiedStardustMultiplier,
    },
  };
}

function convert(gm, spriteId, ranks, rawGm) {
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
    const meta = ranks.get(p.speciesId);
    if (meta) entry.meta = meta;
    const metaShadow = ranks.get(`${p.speciesId}_shadow`);
    if (metaShadow && entry.shadow) entry.metaShadow = metaShadow;
    const kept = tags.filter((t) => KEEP_TAGS.has(t));
    if (kept.length) entry.tags = kept;
    species.push(entry);
  }

  // Evolution costs need both ends of each evolution, so they're added after the loop.
  const byId = new Map(species.map((s) => [s.id, s]));
  for (const sp of species) {
    for (const to of sp.evolutions ?? []) {
      const target = byId.get(to);
      const cost = target && rawGm.evolutionCost(sp, target);
      if (cost) (sp.evo ??= {})[to] = cost;
    }
  }

  species.sort((a, b) => a.dex - b.dex || a.name.localeCompare(b.name));

  const moves = {};
  for (const m of gm.moves) {
    const pve = rawGm.pveMove(m.moveId);
    moves[m.moveId] = {
      name: m.name,
      type: titleCase(m.type),
      // Battle League values, from PvPoke.
      pvp: m.energyGain > 0
        ? { power: m.power, energyGain: m.energyGain, turns: m.turns ?? 1 }
        : { power: m.power, energy: m.energy },
      // Raid and gym values (energy is gained by fast moves, spent by charged moves).
      ...(pve ? { pve } : {}),
    };
  }

  return {
    source:
      "PvPoke game master and rankings (https://github.com/pvpoke/pvpoke), MIT License. Raid stats, evolution and power-up costs: Pokémon GO game master via PokeMiners. Image IDs: PokeAPI.",
    sourceUpdated: gm.timestamp ?? null,
    species,
    moves,
    typeChart: rawGm.typeChart,
    weather: rawGm.weather,
    raid: rawGm.raid,
    upgrade: rawGm.upgrade,
  };
}

const [gmText, csvText, rawGmText, ...rankTexts] = await Promise.all([
  loadText("gamemaster.json", SOURCE_URL, "PvPoke data"),
  loadText("pokemon.csv", POKEAPI_CSV_URL, "PokeAPI form list"),
  loadText("game-master.json", RAW_GM_URL, "Pokémon GO game master"),
  ...Object.values(LEAGUES).map((cap) => loadText(`rankings-${cap}.json`, RANKINGS_URL(cap), `PvPoke ${cap} rankings`)),
]);
const rankings = Object.fromEntries(Object.keys(LEAGUES).map((league, i) => [league, JSON.parse(rankTexts[i])]));
const data = convert(
  JSON.parse(gmText),
  spriteMatcher(csvText),
  leagueRanks(rankings),
  readRawGameMaster(JSON.parse(rawGmText)),
);

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
