import { PageHeader, ComingSoon } from "../components/PageHeader";

export default function Pokedex() {
  return (
    <>
      <PageHeader title="Pokédex" subtitle="Pokémon GO stats, moves and evolutions" />
      <ComingSoon title="Pokémon GO game data">
        <p>
          The Pokédex will use Pokémon GO's own Attack, Defense and Stamina values and move data, which
          is what accurate CP, IV and raid math needs. It's open to everyone, no account required.
        </p>
      </ComingSoon>
    </>
  );
}
