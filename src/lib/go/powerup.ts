// What it costs to power a Pokémon up between two levels.

export type UpgradeTable = {
  stardust: number[]; // per power-up, indexed by floor(level) - 1
  candy: number[]; // same; 0 from level 40 up, where XL Candy takes over
  xl: number[]; // per power-up, indexed by floor(level) - 40
  shadowMultiplier: number;
  purifiedMultiplier: number;
};

export type Cost = { stardust: number; candy: number; xl: number };

export function powerUpCost(
  from: number,
  to: number,
  table: UpgradeTable,
  opts: { shadow?: boolean; purified?: boolean; lucky?: boolean } = {},
): Cost {
  const mult = opts.shadow ? table.shadowMultiplier : opts.purified ? table.purifiedMultiplier : 1;
  const cost: Cost = { stardust: 0, candy: 0, xl: 0 };
  for (let level = from; level < to; level += 0.5) {
    const i = Math.floor(level) - 1;
    const dust = Math.round((table.stardust[i] ?? 0) * mult);
    cost.stardust += opts.lucky ? Math.round(dust / 2) : dust;
    if (level < 40) cost.candy += Math.ceil((table.candy[i] ?? 0) * mult);
    else cost.xl += Math.ceil((table.xl[Math.floor(level) - 40] ?? 0) * mult);
  }
  return cost;
}

export function describeCost(c: Cost): string {
  const parts = [`${c.stardust.toLocaleString("en-US")} stardust`];
  if (c.candy) parts.push(`${c.candy.toLocaleString("en-US")} candy`);
  if (c.xl) parts.push(`${c.xl.toLocaleString("en-US")} XL Candy`);
  return parts.join(", ");
}
