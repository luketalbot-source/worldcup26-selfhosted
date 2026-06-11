// Venue-local match-day grouping (June 2026): European users were
// losing late US kickoffs off the Today tab because grouping used the
// USER's calendar day. These tests pin the venue-day semantics with a
// fixed "now" so they're independent of the machine's timezone.
import { describe, it, expect } from "vitest";
import { getVenueTimezone, isMatchToday, venueDayOffset } from "@/lib/venueTimezones";

describe("getVenueTimezone", () => {
  it("maps prod venue strings (including FD's short forms)", () => {
    expect(getVenueTimezone("MetLife Stadium")).toBe("America/New_York");
    expect(getVenueTimezone("Azteca")).toBe("America/Mexico_City"); // FD short form
    expect(getVenueTimezone("Estadio Azteca")).toBe("America/Mexico_City");
    expect(getVenueTimezone("AKRON")).toBe("America/Mexico_City");
    expect(getVenueTimezone("Levi's Stadium")).toBe("America/Los_Angeles");
    expect(getVenueTimezone("Estadio BBVA")).toBe("America/Monterrey");
    expect(getVenueTimezone("BC Place")).toBe("America/Vancouver");
  });

  it("returns null for unknown / missing venues", () => {
    expect(getVenueTimezone("Wembley")).toBeNull();
    expect(getVenueTimezone(null)).toBeNull();
    expect(getVenueTimezone(undefined)).toBeNull();
  });
});

describe("isMatchToday (venue-day semantics)", () => {
  // The reported case: 02:00 CEST June 14 kickoff = 20:00 ET June 13 at
  // MetLife. Evening of June 13 in Germany (21:00 CEST = 19:00 UTC),
  // the match must count as TODAY even though the user's calendar
  // already crosses to June 14 at kickoff.
  const eveningJun13Germany = new Date("2026-06-13T19:00:00Z");

  it("keeps a late-night-for-Europe kickoff on the venue's day", () => {
    expect(
      isMatchToday("2026-06-14T00:00:00Z", "MetLife Stadium", eveningJun13Germany),
    ).toBe(true); // 20:00 ET June 13 at the venue
  });

  it("still counts the match while it is in progress after user midnight", () => {
    const duringMatch = new Date("2026-06-14T00:30:00Z"); // 02:30 CEST Jun 14, 20:30 ET Jun 13
    expect(isMatchToday("2026-06-14T00:00:00Z", "MetLife Stadium", duringMatch)).toBe(true);
  });

  it("drops the match once the VENUE rolls past midnight", () => {
    const nextMorningEt = new Date("2026-06-14T11:00:00Z"); // 07:00 ET June 14
    expect(isMatchToday("2026-06-14T00:00:00Z", "MetLife Stadium", nextMorningEt)).toBe(false);
  });

  it("excludes tomorrow's venue-day games", () => {
    expect(
      isMatchToday("2026-06-14T20:00:00Z", "MetLife Stadium", eveningJun13Germany),
    ).toBe(false); // 16:00 ET June 14 — tomorrow at the venue
  });

  it("handles Mexico City (no DST, UTC-6)", () => {
    // 02:00 UTC June 14 = 20:00 June 13 in Mexico City
    expect(isMatchToday("2026-06-14T02:00:00Z", "Azteca", eveningJun13Germany)).toBe(true);
  });

  it("rejects invalid dates", () => {
    expect(isMatchToday("not-a-date", "MetLife Stadium", eveningJun13Germany)).toBe(false);
  });
});

describe("venueDayOffset (drives the Past/Yesterday/Today/Tomorrow/Future pills)", () => {
  // Fixed clock: 19:00 UTC June 13 = 15:00 ET June 13 at MetLife.
  const now = new Date("2026-06-13T19:00:00Z");

  it("computes signed venue-day offsets across the windows", () => {
    // 20:00 ET June 11 → two venue-days ago → Past window
    expect(venueDayOffset("2026-06-12T00:00:00Z", "MetLife Stadium", now)).toBe(-2);
    // 20:00 ET June 12 → Yesterday
    expect(venueDayOffset("2026-06-13T00:00:00Z", "MetLife Stadium", now)).toBe(-1);
    // 20:00 ET June 13 → Today (despite being June 14 in user-UTC terms)
    expect(venueDayOffset("2026-06-14T00:00:00Z", "MetLife Stadium", now)).toBe(0);
    // 16:00 ET June 14 → Tomorrow
    expect(venueDayOffset("2026-06-14T20:00:00Z", "MetLife Stadium", now)).toBe(1);
    // 16:00 ET June 15 → +2 venue-days → Future window
    expect(venueDayOffset("2026-06-15T20:00:00Z", "MetLife Stadium", now)).toBe(2);
  });

  it("returns null for invalid dates", () => {
    expect(venueDayOffset("garbage", "MetLife Stadium", now)).toBeNull();
  });
});
