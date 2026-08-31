import { describe, expect, it } from "vitest";
import { snapshotsToCsv } from "./profileService";

describe("snapshotsToCsv", () => {
  it("writes a header and one row per snapshot", () => {
    const csv = snapshotsToCsv([
      { fetchedAt: new Date("2026-01-01T00:00:00.000Z"), followers: 100, following: 10, posts: 5 },
      { fetchedAt: new Date("2026-01-02T00:00:00.000Z"), followers: 110, following: 10, posts: 5 },
    ]);

    const lines = csv.split("\n");
    expect(lines[0]).toBe("data,seguidores,seguindo,posts");
    expect(lines[1]).toBe("2026-01-01T00:00:00.000Z,100,10,5");
    expect(lines[2]).toBe("2026-01-02T00:00:00.000Z,110,10,5");
  });

  it("returns just the header for an empty list", () => {
    expect(snapshotsToCsv([])).toBe("data,seguidores,seguindo,posts");
  });
});
