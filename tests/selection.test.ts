import { describe, expect, it } from "vitest";
import { selectionToNatural } from "../src/renderer/selection";

describe("selectionToNatural", () => {
  it("maps displayed coordinates to natural image coordinates", () => {
    expect(
      selectionToNatural(
        { x: 10, y: 20, width: 30, height: 40 },
        { width: 200, height: 100 },
        { width: 1000, height: 500 }
      )
    ).toEqual({ x: 50, y: 100, width: 150, height: 200 });
  });
});
