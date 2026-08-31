import { describe, expect, it } from "vitest";
import { isValidInstagramUsername, parseAbbreviatedNumber } from "./instagram";

describe("parseAbbreviatedNumber", () => {
  it("parses plain integers", () => {
    expect(parseAbbreviatedNumber("79465")).toBe(79465);
  });

  it("parses numbers with thousands separators", () => {
    expect(parseAbbreviatedNumber("79,465")).toBe(79465);
  });

  it("parses k/m/b suffixes", () => {
    expect(parseAbbreviatedNumber("1.2k")).toBe(1200);
    expect(parseAbbreviatedNumber("1.2m")).toBe(1_200_000);
    expect(parseAbbreviatedNumber("2b")).toBe(2_000_000_000);
  });

  it("is case-insensitive for suffixes", () => {
    expect(parseAbbreviatedNumber("1.5M")).toBe(1_500_000);
  });

  it("returns 0 for unparseable input", () => {
    expect(parseAbbreviatedNumber("nao e um numero")).toBe(0);
  });
});

describe("isValidInstagramUsername", () => {
  it("accepts letters, numbers, dots and underscores", () => {
    expect(isValidInstagramUsername("dani.morais_01")).toBe(true);
  });

  it("rejects spaces and special characters", () => {
    expect(isValidInstagramUsername("dani morais")).toBe(false);
    expect(isValidInstagramUsername("dani@morais")).toBe(false);
  });

  it("rejects usernames longer than 30 characters", () => {
    expect(isValidInstagramUsername("a".repeat(31))).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidInstagramUsername("")).toBe(false);
  });
});
