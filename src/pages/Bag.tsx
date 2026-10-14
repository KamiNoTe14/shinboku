import { PageHeader, ComingSoon } from "../components/PageHeader";

export default function Bag() {
  return (
    <>
      <PageHeader title="Bag" subtitle="0 Pokémon logged" />
      <ComingSoon title="Fast entry and the bag table">
        <p>
          This is where your Pokémon will live: a sortable, filterable table built for thousands of
          rows, with shift-click and ctrl-click selection.
        </p>
        <p>
          Entry will be keyboard-first: species autocomplete, moves limited to what that species can
          learn, appraisal typed as three numbers, and single-key flags for shiny, lucky, shadow and
          purified.
        </p>
      </ComingSoon>
    </>
  );
}
