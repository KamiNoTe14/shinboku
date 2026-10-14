// Fake bag rows for the landing page's animated background.
// Seeded so the wall looks the same on every visit.

export type WallRow = {
  name: string;
  cp: number;
  iv: [number, number, number];
  fast: string;
  charged: string;
  flag: "shiny" | "lucky" | "shadow" | null;
};

const species: [string, string, string][] = [
  ["Machamp", "Counter", "Dynamic Punch"],
  ["Gyarados", "Waterfall", "Hydro Pump"],
  ["Dragonite", "Dragon Breath", "Outrage"],
  ["Tyranitar", "Smack Down", "Brutal Swing"],
  ["Metagross", "Bullet Punch", "Meteor Mash"],
  ["Gengar", "Lick", "Shadow Ball"],
  ["Swampert", "Mud Shot", "Hydro Cannon"],
  ["Lucario", "Counter", "Aura Sphere"],
  ["Garchomp", "Mud Shot", "Earth Power"],
  ["Salamence", "Dragon Tail", "Outrage"],
  ["Rhyperior", "Mud-Slap", "Rock Wrecker"],
  ["Mamoswine", "Powder Snow", "Avalanche"],
  ["Togekiss", "Charm", "Dazzling Gleam"],
  ["Gardevoir", "Charm", "Dazzling Gleam"],
  ["Excadrill", "Mud Shot", "Drill Run"],
  ["Chandelure", "Fire Spin", "Overheat"],
  ["Hydreigon", "Dragon Breath", "Brutal Swing"],
  ["Snorlax", "Lick", "Body Slam"],
  ["Azumarill", "Bubble", "Ice Beam"],
  ["Medicham", "Counter", "Ice Punch"],
  ["Venusaur", "Vine Whip", "Frenzy Plant"],
  ["Charizard", "Fire Spin", "Blast Burn"],
  ["Blastoise", "Water Gun", "Hydro Cannon"],
  ["Electivire", "Thunder Shock", "Wild Charge"],
  ["Magnezone", "Spark", "Wild Charge"],
  ["Roserade", "Bullet Seed", "Weather Ball"],
  ["Conkeldurr", "Counter", "Dynamic Punch"],
  ["Haxorus", "Counter", "Breaking Swipe"],
  ["Walrein", "Powder Snow", "Icicle Spear"],
  ["Scizor", "Fury Cutter", "X-Scissor"],
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeWall(count: number): WallRow[] {
  const rand = mulberry32(1998);
  const stat = () => Math.min(15, Math.floor(rand() * 13) + (rand() > 0.7 ? 3 : 0));
  return Array.from({ length: count }, () => {
    const [name, fast, charged] = species[Math.floor(rand() * species.length)];
    const r = rand();
    return {
      name,
      fast,
      charged,
      cp: 900 + Math.floor(rand() * 3400),
      iv: [stat(), stat(), stat()],
      flag: r > 0.94 ? "shiny" : r > 0.88 ? "lucky" : r > 0.82 ? "shadow" : null,
    };
  });
}
