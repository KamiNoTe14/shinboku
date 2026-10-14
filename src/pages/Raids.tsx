import { PageHeader, ComingSoon } from "../components/PageHeader";

export default function Raids() {
  return (
    <>
      <PageHeader title="Raid counters" subtitle="Best attackers against any boss" />
      <ComingSoon title="Counters, general and personal">
        <p>
          Pick a raid boss to see the best counters overall. When you're signed in, Shinboku will also
          build the best team from the Pokémon in your own bag.
        </p>
      </ComingSoon>
    </>
  );
}
