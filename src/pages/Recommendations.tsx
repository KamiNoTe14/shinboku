import { PageHeader, ComingSoon } from "../components/PageHeader";

export default function Recommendations() {
  return (
    <>
      <PageHeader title="Recommendations" subtitle="What to transfer, power up, evolve and raid with" />
      <ComingSoon title="Suggestions from your own bag">
        <p>
          Once your bag has Pokémon in it, Shinboku will suggest transfers, power-ups, evolutions and
          raid teams. Every suggestion comes with a short reason, and nothing happens automatically.
        </p>
      </ComingSoon>
    </>
  );
}
