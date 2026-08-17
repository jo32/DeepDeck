import { describe, expect, it } from "vitest";
import {
  isPointInsideBounds,
  mapGazeToCharacter,
  normalizeGazePoint,
} from "../../../plugins/home-hero/src/client/gaze.ts";

const bounds = { left: 900, top: 300, width: 160, height: 160 };

describe("home hero gaze geometry", () => {
  it("normalizes the character center and clamps distant diagonal pointers", () => {
    expect(normalizeGazePoint(980, 380, bounds, 1440, 900)).toEqual({ x: 0, y: 0 });

    const distant = normalizeGazePoint(-1000, -1000, bounds, 1440, 900);
    expect(Math.hypot(distant.x, distant.y)).toBeCloseTo(1, 8);
    expect(distant.x).toBeLessThan(0);
    expect(distant.y).toBeLessThan(0);
  });

  it("maps screen direction to bounded eye movement and natural head angles", () => {
    const downRight = mapGazeToCharacter({ x: 1, y: 1 });

    expect(downRight.eyeX).toBeCloseTo(0.066);
    expect(downRight.eyeY).toBeCloseTo(-0.056);
    expect(downRight.headYaw).toBeCloseTo(0.22);
    expect(downRight.headPitch).toBeCloseTo(0.15);
    expect(Math.abs(downRight.headRoll)).toBeLessThan(0.03);

    expect(mapGazeToCharacter({ x: 9, y: -9 })).toEqual(
      mapGazeToCharacter({ x: 1, y: -1 }),
    );
  });

  it("uses the visible character bounds as the drag exit boundary", () => {
    expect(isPointInsideBounds(900, 300, bounds)).toBe(true);
    expect(isPointInsideBounds(1060, 460, bounds)).toBe(true);
    expect(isPointInsideBounds(899.9, 380, bounds)).toBe(false);
    expect(isPointInsideBounds(980, 460.1, bounds)).toBe(false);
  });
});
