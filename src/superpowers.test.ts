import { describe, expect, it } from "vitest";
import { detectSuperpowers, parseSuperpowers } from "./superpowers.js";

const list = (entries: object[]) => JSON.stringify(entries);

describe("parseSuperpowers", () => {
  it("is installed when an enabled superpowers plugin is listed", () => {
    expect(
      parseSuperpowers(
        list([
          { id: "brag@brag", enabled: true },
          { id: "superpowers@claude-plugins-official", enabled: true },
        ]),
      ),
    ).toBe("installed");
  });

  it("is missing when it is absent or only disabled", () => {
    expect(parseSuperpowers(list([{ id: "brag@brag", enabled: true }]))).toBe("missing");
    expect(
      parseSuperpowers(list([{ id: "superpowers@claude-plugins-official", enabled: false }])),
    ).toBe("missing");
  });

  it("does not match a plugin whose name only starts with superpowers", () => {
    expect(parseSuperpowers(list([{ id: "superpowers-extra@x", enabled: true }]))).toBe("missing");
  });

  it("is unknown when claude did not run or printed something else", () => {
    expect(parseSuperpowers(null)).toBe("unknown");
    expect(parseSuperpowers("Warning: update available\n[]")).toBe("unknown");
    expect(parseSuperpowers('{"plugins":[]}')).toBe("unknown");
  });
});

describe("detectSuperpowers", () => {
  it("parses what the runner returns", () => {
    expect(detectSuperpowers(() => list([{ id: "superpowers@x", enabled: true }]))).toBe(
      "installed",
    );
    expect(detectSuperpowers(() => null)).toBe("unknown");
  });
});
