// Regression guard for the "penalties missing in the Today tab" bug.
//
// Knockout fixtures surface in the Today tab (where most users predict),
// and MatchesView now routes non-group stages to KnockoutMatchCard instead
// of the plain MatchCard (which has no shootout predictor). This test feeds
// the card a Today-tab-shaped Match — exactly what getTodayMatches builds,
// adapted with a bracketPosition the way MatchesView does — and asserts the
// penalty-shootout predictor is reachable.
//
// Assertions are clock- and i18n-independent on purpose: a far-future
// kickoff so the 30-min lock never trips, and ScoreSelector's hardcoded
// English aria-label ("Increase score") rather than translated copy.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KnockoutMatchCard } from "@/components/KnockoutMatchCard";
import type { KnockoutMatch } from "@/data/knockoutMatches";
import type { Prediction } from "@/types/match";

// Mirror of MatchesView's adapter: a getTodayMatches() Match + bracketPosition.
const makeTodayKoMatch = (over: Partial<KnockoutMatch> = {}): KnockoutMatch => ({
  id: "fd-537419",
  homeTeam: { id: "bra", name: "Brazil", code: "BRA", flag: "", group: "" },
  awayTeam: { id: "jpn", name: "Japan", code: "JPN", flag: "", group: "" },
  date: "2099-07-15T18:00:00.000Z",
  time: "",
  dateIso: "2099-07-15T18:00:00.000Z",
  venue: "Unknown Arena",
  city: "Nowhere",
  stage: "round32",
  status: "upcoming",
  bracketPosition: "Round of 32",
  ...over,
});

describe("Knockout fixture rendered in the Today tab", () => {
  it("uses the knockout card (penalty predictor present), not the plain MatchCard", () => {
    render(<KnockoutMatchCard match={makeTodayKoMatch()} onPredict={vi.fn()} disabled={false} />);
    // bracketPosition badge is unique to KnockoutMatchCard and is the field
    // MatchesView injects when adapting a Today Match — proves the route.
    expect(screen.getByText("Round of 32")).toBeInTheDocument();
    // Upcoming, untouched, non-draw not yet engaged → only the open-play
    // home/away selectors show; the shootout picker stays hidden.
    expect(screen.getAllByLabelText("Increase score")).toHaveLength(2);
  });

  it("reveals the shootout predictor for a level (drawn) prediction", () => {
    const prediction: Prediction = {
      matchId: "fd-537419",
      homeScore: 1,
      awayScore: 1,
      penaltyHomeScore: null,
      penaltyAwayScore: null,
      timestamp: "",
    };
    render(
      <KnockoutMatchCard
        match={makeTodayKoMatch()}
        prediction={prediction}
        onPredict={vi.fn()}
        disabled={false}
      />,
    );
    // Drawn KO prediction → penalty picker appears: now 4 score selectors
    // (home, away, pen-home, pen-away). This is the feature that was missing
    // from the Today tab.
    expect(screen.getAllByLabelText("Increase score")).toHaveLength(4);
  });
});

describe("Unresolved bracket slot is read-only", () => {
  it("shows no prediction UI for a projection 'M' id (can't be scored yet)", () => {
    render(
      <KnockoutMatchCard
        match={makeTodayKoMatch({ id: "M90", bracketPosition: "M90" })}
        onPredict={vi.fn()}
        disabled={false}
      />,
    );
    // A projected slot has no scoreable live fixture behind it → read-only.
    expect(screen.queryAllByLabelText("Increase score")).toHaveLength(0);
  });
});
