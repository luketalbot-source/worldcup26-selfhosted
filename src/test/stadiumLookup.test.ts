// Every venue string the app can encounter must resolve to one of the
// 16 host stadiums — both our static fixture spellings and the
// abbreviated forms football-data.org ships ("Azteca", "AKRON"). FD
// renames venues mid-tournament without notice, so these tests pin the
// pattern table against every known spelling.
import { describe, it, expect } from "vitest";
import { STADIUMS, findStadium } from "@/data/stadiums";
import { groupStageMatches } from "@/data/matches";
import { getAllKnockoutMatches } from "@/data/knockoutMatches";

describe("findStadium", () => {
  it("resolves every static group-stage fixture venue", () => {
    for (const m of groupStageMatches) {
      if (!m.venue && !m.city) continue;
      const hit = findStadium(m.venue, m.city);
      expect(hit, `unresolved venue "${m.venue}" / city "${m.city}"`).not.toBeNull();
    }
  });

  it("resolves every static knockout fixture venue", () => {
    for (const m of getAllKnockoutMatches()) {
      if (!m.venue && !m.city) continue;
      const hit = findStadium(m.venue, m.city);
      expect(hit, `unresolved venue "${m.venue}" / city "${m.city}"`).not.toBeNull();
    }
  });

  it("resolves football-data.org's abbreviated venue spellings", () => {
    expect(findStadium("Azteca")?.slug).toBe("azteca");
    expect(findStadium("AKRON")?.slug).toBe("akron");
    expect(findStadium("Estadio BBVA")?.slug).toBe("bbva");
    expect(findStadium("MetLife Stadium")?.slug).toBe("metlife");
    expect(findStadium("Levi's Stadium")?.slug).toBe("levis");
    expect(findStadium("GEHA Field at Arrowhead Stadium")?.slug).toBe("arrowhead");
    expect(findStadium("Lumen Field")?.slug).toBe("lumen");
  });

  it("resolves compound venue/city strings via city fallback", () => {
    expect(findStadium("SoFi Stadium / Los Angeles")?.slug).toBe("sofi");
    expect(findStadium("Some Renamed Arena", "Seattle")?.slug).toBe("lumen");
  });

  it("returns null for unknown and TBD venues", () => {
    expect(findStadium("TBD")).toBeNull();
    expect(findStadium(null)).toBeNull();
    expect(findStadium("Wembley Stadium", "London")).toBeNull();
  });

  it("each stadium has a vendored image path and credit", () => {
    for (const s of STADIUMS) {
      expect(s.image).toMatch(/^\/stadiums\/[a-z]+\.jpg$/);
      expect(s.photoCredit.length).toBeGreaterThan(5);
      expect(s.capacity).toBeGreaterThan(20000);
    }
  });
});
