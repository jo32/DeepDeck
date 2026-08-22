"use client";

import { useEffect, useRef, useState } from "react";
import {
  EXPRESSION_OPTIONS,
  type OrbExpression,
} from "./orb-expressions";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  CapsuleGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Quaternion,
  RectAreaLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";

type Expression = OrbExpression;
type PoseExpression = Exclude<Expression, "auto">;
type Side = -1 | 1;
type Point = readonly [number, number];
type OrbAppearance = "spider" | "whale" | "alien";

export type OrbActionMode = "face" | "send" | "doing" | "stop";

const FULL_TURN = Math.PI * 2;
const ACTION_SETTLE_MS = 480;
const ACTION_LOOP_MS = 4_200;

type CubicSegment = {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
};

type EyePose = {
  open: number;
  width: number;
  rotation: number;
  x: number;
  y: number;
  roundness: number;
};

type FacePose = {
  left: EyePose;
  right: EyePose;
  headScaleX: number;
  headScaleY: number;
  headScaleZ: number;
  headRoll: number;
  headPitch: number;
  headYaw: number;
  lift: number;
};

type EyePatch = {
  side: Side;
  group: Group;
  lensGeometry: BufferGeometry;
  rimGeometry: BufferGeometry;
  baseOutline: readonly { x: number; y: number }[];
  roundOutline: readonly { x: number; y: number }[];
  circular: boolean;
  centerX: number;
  centerY: number;
  lensBulge: number;
  rimBulge: number;
  rimScale: number;
  lensSurfaceOffset: number;
  rimSurfaceOffset: number;
};

type LiquidNode = {
  origin: Vector3;
  target: Vector3;
  radius: number;
  phase: number;
  curl: Vector3;
};

type TerminalPiece = {
  mesh: Mesh;
  delay: number;
};

type LiquidGlyph = {
  id: "thinking" | "doing" | "surprised";
  effect: MarchingCubes;
  terminal: Group;
  terminalPieces: TerminalPiece[];
  fieldMin: Vector3;
  fieldSize: number;
  source: Vector3;
  nodes: LiquidNode[];
  weight: number;
  velocity: number;
};

const SPIDER_PATH: readonly CubicSegment[] = [
  {
    p0: [-0.32, -0.14],
    c1: [-0.24, -0.02],
    c2: [0.06, 0.26],
    p1: [0.17, 0.41],
  },
  {
    p0: [0.17, 0.41],
    c1: [0.23, 0.3],
    c2: [0.31, 0.11],
    p1: [0.3, -0.08],
  },
  {
    p0: [0.3, -0.08],
    c1: [0.29, -0.23],
    c2: [0.2, -0.35],
    p1: [0.04, -0.39],
  },
  {
    p0: [0.04, -0.39],
    c1: [-0.1, -0.38],
    c2: [-0.25, -0.28],
    p1: [-0.32, -0.14],
  },
];

const ROUND_PATH: readonly CubicSegment[] = [
  {
    p0: [-0.28, -0.05],
    c1: [-0.28, 0.15],
    c2: [-0.12, 0.36],
    p1: [0.08, 0.4],
  },
  {
    p0: [0.08, 0.4],
    c1: [0.24, 0.36],
    c2: [0.31, 0.17],
    p1: [0.31, -0.02],
  },
  {
    p0: [0.31, -0.02],
    c1: [0.31, -0.22],
    c2: [0.19, -0.37],
    p1: [0.02, -0.4],
  },
  {
    p0: [0.02, -0.4],
    c1: [-0.15, -0.39],
    c2: [-0.29, -0.24],
    p1: [-0.28, -0.05],
  },
];

const ALIEN_PATH: readonly CubicSegment[] = [
  {
    p0: [-0.25, -0.3],
    c1: [-0.25, -0.18],
    c2: [0.07, 0.35],
    p1: [0.17, 0.35],
  },
  {
    p0: [0.17, 0.35],
    c1: [0.25, 0.35],
    c2: [0.3, 0.14],
    p1: [0.3, -0.04],
  },
  {
    p0: [0.3, -0.04],
    c1: [0.3, -0.22],
    c2: [0.15, -0.38],
    p1: [0.03, -0.38],
  },
  {
    p0: [0.03, -0.38],
    c1: [-0.1, -0.38],
    c2: [-0.25, -0.42],
    p1: [-0.25, -0.3],
  },
];

const ALIEN_ROUND_PATH: readonly CubicSegment[] = [
  {
    p0: [-0.23, -0.27],
    c1: [-0.23, -0.13],
    c2: [0.05, 0.34],
    p1: [0.15, 0.34],
  },
  {
    p0: [0.15, 0.34],
    c1: [0.24, 0.34],
    c2: [0.29, 0.15],
    p1: [0.29, -0.04],
  },
  {
    p0: [0.29, -0.04],
    c1: [0.29, -0.22],
    c2: [0.14, -0.37],
    p1: [0.01, -0.37],
  },
  {
    p0: [0.01, -0.37],
    c1: [-0.11, -0.37],
    c2: [-0.23, -0.41],
    p1: [-0.23, -0.27],
  },
];

const EYE_RINGS = 20;
const EYE_STEPS_PER_SEGMENT = 18;
const EYE_CENTER_X = 0.35;
const EYE_CENTER_Y = 0.035;

function cubicPoint(segment: CubicSegment, t: number) {
  const inverse = 1 - t;
  const inverse2 = inverse * inverse;
  const t2 = t * t;

  return {
    x:
      inverse2 * inverse * segment.p0[0] +
      3 * inverse2 * t * segment.c1[0] +
      3 * inverse * t2 * segment.c2[0] +
      t2 * t * segment.p1[0],
    y:
      inverse2 * inverse * segment.p0[1] +
      3 * inverse2 * t * segment.c1[1] +
      3 * inverse * t2 * segment.c2[1] +
      t2 * t * segment.p1[1],
  };
}

function samplePath(path: readonly CubicSegment[]) {
  return path.flatMap((segment) =>
    Array.from({ length: EYE_STEPS_PER_SEGMENT }, (_, index) =>
      cubicPoint(segment, index / EYE_STEPS_PER_SEGMENT),
    ),
  );
}

const SPIDER_OUTLINE = samplePath(SPIDER_PATH);
const ROUND_OUTLINE = samplePath(ROUND_PATH);
const ALIEN_OUTLINE = samplePath(ALIEN_PATH);
const ALIEN_ROUND_OUTLINE = samplePath(ALIEN_ROUND_PATH);

function sampleCircleOutline(radius: number) {
  return Array.from({ length: SPIDER_OUTLINE.length }, (_, index) => {
    const angle = (index / SPIDER_OUTLINE.length) * Math.PI * 2;

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
}

const WHALE_OUTLINE = sampleCircleOutline(0.18);
const WHALE_ROUND_OUTLINE = sampleCircleOutline(0.18);

function circularEyePose(pose: EyePose) {
  const size = MathUtils.clamp(pose.open, 0.62, 1.18);
  return {
    ...pose,
    open: size,
    width: size,
    rotation: 0,
    roundness: 0,
  };
}

function eye(
  open = 1,
  width = 1,
  rotation = 0,
  x = 0,
  y = 0,
  roundness = 0,
): EyePose {
  return { open, width, rotation, x, y, roundness };
}

const POSES: Record<PoseExpression, FacePose> = {
  neutral: {
    left: eye(),
    right: eye(),
    headScaleX: 1,
    headScaleY: 1.03,
    headScaleZ: 1,
    headRoll: 0,
    headPitch: 0,
    headYaw: 0,
    lift: 0,
  },
  suspicious: {
    left: eye(0.42, 1.02, -0.1, -0.012, 0.055, 0.08),
    right: eye(0.68, 0.96, 0.08, 0.008, 0.005, 0.14),
    headScaleX: 1.015,
    headScaleY: 1.015,
    headScaleZ: 1,
    headRoll: -0.065,
    headPitch: 0.018,
    headYaw: 0.025,
    lift: 0.004,
  },
  thinking: {
    left: eye(0.74, 0.9, -0.05, 0.036, 0.06, 0.2),
    right: eye(0.5, 0.88, 0.04, 0.04, 0.075, 0.28),
    headScaleX: 0.995,
    headScaleY: 1.035,
    headScaleZ: 1,
    headRoll: 0.048,
    headPitch: -0.035,
    headYaw: -0.055,
    lift: 0.012,
  },
  doing: {
    left: eye(0.66, 0.7, -0.02, 0, 0.045, 0.72),
    right: eye(0.66, 0.7, 0.02, 0, 0.045, 0.72),
    headScaleX: 1.01,
    headScaleY: 1.02,
    headScaleZ: 1,
    headRoll: 0,
    headPitch: -0.018,
    headYaw: 0,
    lift: 0.01,
  },
  happy: {
    left: eye(0.27, 1.06, 0.19, 0, -0.005, 0.08),
    right: eye(0.27, 1.06, 0.19, 0, -0.005, 0.08),
    headScaleX: 1.03,
    headScaleY: 1.01,
    headScaleZ: 1,
    headRoll: 0,
    headPitch: -0.018,
    headYaw: 0,
    lift: 0.016,
  },
  sleepy: {
    left: eye(0.12, 1.02, 0.02, 0, -0.025, 0.18),
    right: eye(0.12, 1.02, 0.02, 0, -0.025, 0.18),
    headScaleX: 1.015,
    headScaleY: 0.99,
    headScaleZ: 1,
    headRoll: -0.045,
    headPitch: 0.055,
    headYaw: 0,
    lift: -0.018,
  },
  surprised: {
    left: eye(1.17, 0.82, 0, -0.006, 0.03, 0.94),
    right: eye(1.17, 0.82, 0, 0.006, 0.03, 0.94),
    headScaleX: 1.025,
    headScaleY: 1.055,
    headScaleZ: 0.985,
    headRoll: 0,
    headPitch: -0.03,
    headYaw: 0,
    lift: 0.028,
  },
};

const AUTO_SEQUENCE: readonly PoseExpression[] = [
  "neutral",
  "suspicious",
  "thinking",
  "doing",
  "happy",
  "sleepy",
  "surprised",
];

function resolveExpression(expression: Expression, elapsed: number) {
  if (expression !== "auto") return expression;
  const seconds = elapsed * 0.001;
  return AUTO_SEQUENCE[Math.floor(seconds / 2.45) % AUTO_SEQUENCE.length];
}

function clonePose(pose: FacePose): FacePose {
  return {
    ...pose,
    left: { ...pose.left },
    right: { ...pose.right },
  };
}

function approachEye(current: EyePose, target: EyePose, amount: number) {
  current.open += (target.open - current.open) * amount;
  current.width += (target.width - current.width) * amount;
  current.rotation += (target.rotation - current.rotation) * amount;
  current.x += (target.x - current.x) * amount;
  current.y += (target.y - current.y) * amount;
  current.roundness += (target.roundness - current.roundness) * amount;
}

function approachPose(current: FacePose, target: FacePose, amount: number) {
  approachEye(current.left, target.left, amount);
  approachEye(current.right, target.right, amount);
  current.headScaleX += (target.headScaleX - current.headScaleX) * amount;
  current.headScaleY += (target.headScaleY - current.headScaleY) * amount;
  current.headScaleZ += (target.headScaleZ - current.headScaleZ) * amount;
  current.headRoll += (target.headRoll - current.headRoll) * amount;
  current.headPitch += (target.headPitch - current.headPitch) * amount;
  current.headYaw += (target.headYaw - current.headYaw) * amount;
  current.lift += (target.lift - current.lift) * amount;
}

function dynamicTarget(expression: Expression, elapsed: number) {
  const seconds = elapsed * 0.001;
  const resolvedExpression = resolveExpression(expression, elapsed);
  const pose = clonePose(POSES[resolvedExpression]);

  if (resolvedExpression === "neutral") {
    const phase = seconds % 5.2;
    if (phase > 4.82 && phase < 5.14) {
      const blink = Math.max(0.08, Math.abs(((phase - 4.82) / 0.32) * 2 - 1));
      pose.left.open *= blink;
      pose.right.open *= blink;
    }
  }

  if (resolvedExpression === "thinking") {
    pose.right.open *= 0.9 + Math.sin(seconds * 2.1) * 0.1;
    pose.headRoll += Math.sin(seconds * 1.05) * 0.012;
  }

  if (resolvedExpression === "doing") {
    const scan = Math.sin(seconds * 2.8) * 0.048;
    const focus = 0.82 + (Math.sin(seconds * 5.4) + 1) * 0.09;
    pose.left.x += scan;
    pose.right.x += scan;
    pose.left.open *= focus;
    pose.right.open *= focus;
    pose.headYaw += Math.sin(seconds * 1.7) * 0.042;
    pose.headRoll += Math.sin(seconds * 2.2) * 0.014;
  }

  if (resolvedExpression === "happy") {
    pose.headScaleY += Math.sin(seconds * 2.4) * 0.008;
    pose.lift += (Math.sin(seconds * 2.4) + 1) * 0.006;
  }

  if (resolvedExpression === "sleepy") {
    const drowse = 0.82 + Math.sin(seconds * 0.9) * 0.18;
    pose.left.open *= drowse;
    pose.right.open *= drowse;
    pose.headPitch += Math.sin(seconds * 0.7) * 0.012;
  }

  if (resolvedExpression === "surprised") {
    const pulse = 1 + Math.sin(seconds * 3.2) * 0.035;
    pose.left.open *= pulse;
    pose.right.open *= pulse;
  }

  return pose;
}

function createPatchGeometry(outlineCount: number) {
  const vertexCount = 1 + outlineCount * EYE_RINGS;
  const geometry = new BufferGeometry();
  const positions = new Float32Array(vertexCount * 3);
  const indices: number[] = [];

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

  for (let index = 0; index < outlineCount; index += 1) {
    const next = (index + 1) % outlineCount;
    indices.push(0, 1 + index, 1 + next);
  }

  for (let ring = 1; ring < EYE_RINGS; ring += 1) {
    const innerStart = 1 + (ring - 1) * outlineCount;
    const outerStart = 1 + ring * outlineCount;

    for (let index = 0; index < outlineCount; index += 1) {
      const next = (index + 1) % outlineCount;
      const inner = innerStart + index;
      const innerNext = innerStart + next;
      const outer = outerStart + index;
      const outerNext = outerStart + next;
      indices.push(inner, outer, outerNext, inner, outerNext, innerNext);
    }
  }

  geometry.setIndex(indices);
  return geometry;
}

function updateEyeGeometry(
  geometry: BufferGeometry,
  side: Side,
  pose: EyePose,
  outlineScale: number,
  surfaceOffset: number,
  baseOutline: readonly { x: number; y: number }[],
  roundOutline: readonly { x: number; y: number }[],
  centerX = EYE_CENTER_X,
  centerY = EYE_CENTER_Y,
  bulge = 0,
) {
  const positions = geometry.getAttribute("position");
  const outlineCount = baseOutline.length;
  const cosine = Math.cos(pose.rotation);
  const sine = Math.sin(pose.rotation);

  const writePoint = (
    index: number,
    u: number,
    v: number,
    radialFactor: number,
  ) => {
    const scaledU = u * pose.width * outlineScale;
    const scaledV = v * pose.open * outlineScale;
    const rotatedU = scaledU * cosine - scaledV * sine;
    const rotatedV = scaledU * sine + scaledV * cosine;
    const x = side * centerX + pose.x + side * rotatedU;
    const y = centerY + pose.y + rotatedV;
    const z = Math.sqrt(Math.max(0.04, 1 - x * x - y * y));
    const dome =
      bulge * Math.pow(Math.max(0, 1 - radialFactor * radialFactor), 1.15);
    const radius = 1 + surfaceOffset + dome;
    positions.setXYZ(index, x * radius, y * radius, z * radius);
  };

  writePoint(0, 0, 0, 0);

  for (let ring = 1; ring <= EYE_RINGS; ring += 1) {
    const factor = ring / EYE_RINGS;
    const start = 1 + (ring - 1) * outlineCount;

    for (let index = 0; index < outlineCount; index += 1) {
      const basePoint = baseOutline[index];
      const roundPoint = roundOutline[index];
      const x = MathUtils.lerp(basePoint.x, roundPoint.x, pose.roundness);
      const y = MathUtils.lerp(basePoint.y, roundPoint.y, pose.roundness);
      writePoint(start + index, x * factor, y * factor, factor);
    }
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

function createEyePatch(
  side: Side,
  lensMaterial: Material,
  rimMaterial: Material,
  pose: EyePose,
  appearance: OrbAppearance,
): EyePatch {
  const baseOutline =
    appearance === "whale"
      ? WHALE_OUTLINE
      : appearance === "alien"
        ? ALIEN_OUTLINE
        : SPIDER_OUTLINE;
  const roundOutline =
    appearance === "whale"
      ? WHALE_ROUND_OUTLINE
      : appearance === "alien"
        ? ALIEN_ROUND_OUTLINE
        : ROUND_OUTLINE;
  const circular = appearance === "whale";
  const centerX = appearance === "alien" ? 0.4 : EYE_CENTER_X;
  const centerY = appearance === "alien" ? -0.025 : EYE_CENTER_Y;
  const lensBulge = appearance === "alien" ? 0.04 : 0;
  const rimBulge = appearance === "alien" ? 0.016 : 0;
  const rimScale = appearance === "alien" ? 1.15 : 1.11;
  const lensSurfaceOffset = appearance === "alien" ? 0.017 : 0.015;
  const rimSurfaceOffset = appearance === "alien" ? 0.008 : 0.006;
  const displayPose = circular ? circularEyePose(pose) : pose;
  const lensGeometry = createPatchGeometry(baseOutline.length);
  const rimGeometry = createPatchGeometry(baseOutline.length);
  const lens = new Mesh(lensGeometry, lensMaterial);
  const rim = new Mesh(rimGeometry, rimMaterial);
  const group = new Group();

  lens.frustumCulled = false;
  rim.frustumCulled = false;
  rim.renderOrder = 1;
  lens.renderOrder = 2;
  group.add(rim, lens);

  const patch = {
    side,
    group,
    lensGeometry,
    rimGeometry,
    baseOutline,
    roundOutline,
    circular,
    centerX,
    centerY,
    lensBulge,
    rimBulge,
    rimScale,
    lensSurfaceOffset,
    rimSurfaceOffset,
  };
  updateEyeGeometry(
    rimGeometry,
    side,
    displayPose,
    rimScale,
    rimSurfaceOffset,
    baseOutline,
    roundOutline,
    centerX,
    centerY,
    rimBulge,
  );
  updateEyeGeometry(
    lensGeometry,
    side,
    displayPose,
    1,
    lensSurfaceOffset,
    baseOutline,
    roundOutline,
    centerX,
    centerY,
    lensBulge,
  );
  return patch;
}

function updateEyePatch(patch: EyePatch, pose: EyePose) {
  const displayPose = patch.circular ? circularEyePose(pose) : pose;
  updateEyeGeometry(
    patch.rimGeometry,
    patch.side,
    displayPose,
    patch.rimScale,
    patch.rimSurfaceOffset,
    patch.baseOutline,
    patch.roundOutline,
    patch.centerX,
    patch.centerY,
    patch.rimBulge,
  );
  updateEyeGeometry(
    patch.lensGeometry,
    patch.side,
    displayPose,
    1,
    patch.lensSurfaceOffset,
    patch.baseOutline,
    patch.roundOutline,
    patch.centerX,
    patch.centerY,
    patch.lensBulge,
  );
}

function insideBackGlyph(kind: "send" | "stop", x: number, y: number) {
  if (kind === "send") {
    const insideStem = Math.abs(x) <= 0.18 && y >= -0.78 && y <= 0.1;
    const insideHead = y >= -0.08
      && y <= 0.82
      && Math.abs(x) <= (0.82 - y) * 0.82 + 0.03;
    return insideStem || insideHead;
  }

  const edge = 0.69;
  const radius = 0.17;
  const dx = Math.max(Math.abs(x) - (edge - radius), 0);
  const dy = Math.max(Math.abs(y) - (edge - radius), 0);
  return Math.abs(x) <= edge
    && Math.abs(y) <= edge
    && dx * dx + dy * dy <= radius * radius;
}

/** The glyph itself is tessellated directly on the rear spherical surface. */
function createBackGlyphGeometry(kind: "send" | "stop") {
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const segments = 96;
  const halfSpan = 0.58;
  const surfaceRadius = 1.014;

  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const y = (v - 0.5) * halfSpan * 2;
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const x = (u - 0.5) * halfSpan * 2;
      const z = -Math.sqrt(Math.max(0.001, 1 - x * x - y * y));
      const normal = new Vector3(x, y, z).normalize();
      positions.push(
        normal.x * surfaceRadius,
        normal.y * surfaceRadius,
        normal.z * surfaceRadius,
      );
      normals.push(normal.x, normal.y, normal.z);
    }
  }

  const stride = segments + 1;
  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const x = ((column + 0.5) / segments - 0.5) * 2;
      const y = ((row + 0.5) / segments - 0.5) * 2;
      if (!insideBackGlyph(kind, x, y)) continue;
      const topLeft = row * stride + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createBackGlyph(kind: "send" | "stop", material: Material) {
  const glyph = new Mesh(createBackGlyphGeometry(kind), material);
  glyph.renderOrder = 4;
  glyph.frustumCulled = false;
  return glyph;
}

const liquidPosition = new Vector3();
const liquidTrailPosition = new Vector3();
const liquidDirection = new Vector3();

function smootherStep(value: number) {
  const clamped = MathUtils.clamp(value, 0, 1);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function nextForwardFacing(reference: number, facing: number) {
  return facing + Math.ceil((reference - facing - 0.0001) / FULL_TURN) * FULL_TURN;
}

function loopTurnAt(progress: number) {
  if (progress < 0.34) return 0;
  if (progress < 0.47) {
    return Math.PI * smootherStep((progress - 0.34) / 0.13);
  }
  if (progress < 0.68) return Math.PI;
  if (progress < 0.81) {
    return Math.PI + Math.PI * smootherStep((progress - 0.68) / 0.13);
  }
  return FULL_TURN;
}

function liquidNode(
  origin: Vector3,
  target: Vector3,
  radius: number,
  phase: number,
  curl: Vector3,
): LiquidNode {
  return { origin, target, radius, phase, curl };
}

const terminalUp = new Vector3(0, 1, 0);

function terminalSphere(
  position: Vector3,
  radius: number,
  material: Material,
  delay = 0,
): TerminalPiece {
  const mesh = new Mesh(new SphereGeometry(radius, 32, 24), material);
  mesh.position.copy(position);
  mesh.frustumCulled = false;
  return { mesh, delay };
}

function terminalCapsule(
  start: Vector3,
  end: Vector3,
  radius: number,
  material: Material,
  delay = 0,
): TerminalPiece {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const mesh = new Mesh(
    new CapsuleGeometry(
      radius,
      Math.max(0.001, length - radius * 2),
      8,
      24,
    ),
    material,
  );
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.quaternion.setFromUnitVectors(terminalUp, direction.normalize());
  mesh.frustumCulled = false;
  return { mesh, delay };
}

function assembleLiquidGlyph(
  id: LiquidGlyph["id"],
  source: Vector3,
  center: Vector3,
  fieldSize: number,
  nodes: LiquidNode[],
  terminalPieces: TerminalPiece[],
  material: Material,
) {
  const effect = new MarchingCubes(38, material, false, false, 12000);
  const fieldMin = center.clone().addScalar(-fieldSize / 2);
  effect.isolation = 80;
  effect.position.copy(center);
  effect.scale.setScalar(fieldSize / 2);
  effect.frustumCulled = false;
  effect.visible = false;
  const terminal = new Group();
  terminal.visible = false;
  terminalPieces.forEach((piece) => {
    piece.mesh.scale.setScalar(0.001);
    piece.mesh.visible = false;
    terminal.add(piece.mesh);
  });

  return {
    id,
    effect,
    terminal,
    terminalPieces,
    fieldMin,
    fieldSize,
    source,
    nodes,
    weight: 0,
    velocity: 0,
  } satisfies LiquidGlyph;
}

function createThinkingGlyph(material: Material) {
  const source = new Vector3(0.45, 0.78, 0.44);
  const dot = new Vector3(0.48, 0.99, 0.28);
  const curve = [
    new Vector3(0.5, 1.15, 0.22),
    new Vector3(0.51, 1.22, 0.19),
    new Vector3(0.56, 1.27, 0.17),
    new Vector3(0.64, 1.31, 0.14),
    new Vector3(0.71, 1.35, 0.12),
    new Vector3(0.75, 1.41, 0.11),
    new Vector3(0.73, 1.47, 0.1),
    new Vector3(0.67, 1.52, 0.1),
    new Vector3(0.58, 1.55, 0.11),
    new Vector3(0.49, 1.55, 0.12),
    new Vector3(0.41, 1.52, 0.14),
    new Vector3(0.35, 1.47, 0.17),
    new Vector3(0.34, 1.42, 0.19),
  ];
  const nodes: LiquidNode[] = [
    liquidNode(
      source,
      dot,
      0.07,
      0.04,
      new Vector3(0.025, 0.05, -0.035),
    ),
  ];

  curve.forEach((point, index) => {
    nodes.push(
      liquidNode(
        index === 0 ? dot : curve[index - 1],
        point,
        index < 2 ? 0.057 : 0.054,
        0.18 + index * 0.032,
        new Vector3(
          (index % 2 === 0 ? 1 : -1) * 0.018,
          0.028,
          (index % 3 - 1) * 0.012,
        ),
      ),
    );
  });
  const terminalPieces: TerminalPiece[] = [
    terminalSphere(dot, 0.068, material, 0),
  ];
  for (let index = 0; index < curve.length - 1; index += 1) {
    terminalPieces.push(
      terminalCapsule(
        curve[index],
        curve[index + 1],
        0.052,
        material,
        0.025 + index * 0.008,
      ),
    );
  }

  return assembleLiquidGlyph(
    "thinking",
    source,
    new Vector3(0.55, 1.16, 0.26),
    1.1,
    nodes,
    terminalPieces,
    material,
  );
}

function createDoingGlyph(material: Material) {
  const source = new Vector3(0.6, 0.68, 0.42);
  const dots = [
    new Vector3(0.68, 1.01, 0.3),
    new Vector3(0.9, 1.07, 0.21),
    new Vector3(1.11, 1.12, 0.12),
  ];
  const nodes = dots.map((dot, index) =>
    liquidNode(
      source,
      dot,
      0.08 - index * 0.006,
      0.07 + index * 0.23,
      new Vector3(0.02 + index * 0.012, 0.08 + index * 0.015, -0.04),
    ),
  );
  const terminalPieces = dots.map((dot, index) =>
    terminalSphere(dot, 0.08 - index * 0.006, material, index * 0.055),
  );

  return assembleLiquidGlyph(
    "doing",
    source,
    new Vector3(0.86, 0.91, 0.27),
    1.1,
    nodes,
    terminalPieces,
    material,
  );
}

function createSurprisedGlyph(material: Material) {
  const source = new Vector3(0, 0.84, 0.54);
  const dot = new Vector3(0, 1.1, 0.25);
  const stem = [
    new Vector3(0, 1.25, 0.2),
    new Vector3(0, 1.36, 0.18),
    new Vector3(0, 1.44, 0.15),
    new Vector3(0, 1.52, 0.12),
    new Vector3(0, 1.59, 0.1),
  ];
  const nodes: LiquidNode[] = [
    liquidNode(
      source,
      dot,
      0.078,
      0.04,
      new Vector3(0.035, 0.055, -0.04),
    ),
  ];

  stem.forEach((point, index) => {
    nodes.push(
      liquidNode(
        index === 0 ? dot : stem[index - 1],
        point,
        0.063 - index * 0.0015,
        0.2 + index * 0.072,
        new Vector3(
          (index % 2 === 0 ? 1 : -1) * 0.016,
          0.035,
          -0.014,
        ),
      ),
    );
  });
  const terminalPieces = [
    terminalSphere(dot, 0.078, material, 0),
    terminalCapsule(stem[0], stem[stem.length - 1], 0.064, material, 0.055),
  ];

  return assembleLiquidGlyph(
    "surprised",
    source,
    new Vector3(0, 1.22, 0.3),
    1.2,
    nodes,
    terminalPieces,
    material,
  );
}

function addLiquidBall(
  glyph: LiquidGlyph,
  position: Vector3,
  radius: number,
) {
  if (radius < 0.006) return;
  const x = (position.x - glyph.fieldMin.x) / glyph.fieldSize;
  const y = (position.y - glyph.fieldMin.y) / glyph.fieldSize;
  const z = (position.z - glyph.fieldMin.z) / glyph.fieldSize;
  const subtract = 14;
  const normalizedRadius = radius / glyph.fieldSize;
  const strength =
    normalizedRadius *
    normalizedRadius *
    (glyph.effect.isolation + subtract);
  glyph.effect.addBall(x, y, z, strength, subtract);
}

function updateLiquidGlyph(
  glyph: LiquidGlyph,
  visible: boolean,
  delta: number,
  time: number,
  snap: boolean,
) {
  const target = visible ? 1 : 0;

  if (snap) {
    glyph.weight = target;
    glyph.velocity = 0;
  } else {
    const stiffness = visible ? 82 : 98;
    const damping = visible ? 13.4 : 15.2;
    glyph.velocity += (target - glyph.weight) * stiffness * delta;
    glyph.velocity *= Math.exp(-damping * delta);
    glyph.weight += glyph.velocity * delta;
    glyph.weight = MathUtils.clamp(glyph.weight, -0.025, 1.055);
  }

  const progress = MathUtils.clamp(glyph.weight, 0, 1);
  if (!visible && progress < 0.001) {
    glyph.effect.visible = false;
    glyph.terminal.visible = false;
    return 0;
  }

  const terminalPresence = smootherStep((progress - 0.72) / 0.26);
  glyph.terminal.visible = terminalPresence > 0.001;
  glyph.terminal.rotation.z =
    glyph.id === "thinking"
      ? Math.sin(time * 0.0017) * 0.018 * terminalPresence
      : 0;
  glyph.terminalPieces.forEach((piece, index) => {
    const local = smootherStep(
      (terminalPresence - piece.delay) / Math.max(0.001, 1 - piece.delay),
    );
    const settle = 1 + Math.sin(local * Math.PI) * 0.065;
    const pulse =
      glyph.id === "doing"
        ? 1 + Math.sin(time * 0.0048 - index * 1.7) * 0.025 * local
        : 1;
    piece.mesh.visible = local > 0.001;
    piece.mesh.scale.setScalar(Math.max(0.001, local * settle * pulse));
  });

  const fieldBlend = 1 - smootherStep((progress - 0.8) / 0.18);
  if (fieldBlend <= 0.001) {
    glyph.effect.visible = false;
    return progress;
  }

  glyph.effect.visible = true;
  glyph.effect.reset();

  const anchorEnvelope =
    Math.pow(Math.sin(progress * Math.PI), 0.8) * fieldBlend;
  if (anchorEnvelope > 0.002) {
    liquidDirection.copy(glyph.source).normalize();
    liquidPosition
      .copy(glyph.source)
      .addScaledVector(liquidDirection, 0.038 * anchorEnvelope);
    addLiquidBall(glyph, liquidPosition, 0.086 * anchorEnvelope);
    liquidPosition.addScaledVector(liquidDirection, 0.05 * anchorEnvelope);
    addLiquidBall(glyph, liquidPosition, 0.058 * anchorEnvelope);
  }

  glyph.nodes.forEach((node, index) => {
    const raw = MathUtils.clamp(
      (progress - node.phase) / Math.max(0.001, 1 - node.phase),
      0,
      1,
    );
    if (raw <= 0) return;

    const local = smootherStep(raw);
    const birth = smootherStep(Math.min(1, raw * 3.4));
    const arc = Math.sin(local * Math.PI);
    const settlePulse =
      glyph.id === "doing"
        ? 1 + Math.sin(time * 0.0048 - index * 1.7) * 0.038 * local
        : glyph.id === "surprised"
          ? 1 + Math.sin(time * 0.0038) * 0.018 * local
          : 1;

    liquidPosition.copy(node.origin).lerp(node.target, local);
    liquidPosition.addScaledVector(node.curl, arc);
    liquidPosition.y +=
      Math.sin(time * 0.0018 + index * 0.72) * 0.0045 * local;
    addLiquidBall(
      glyph,
      liquidPosition,
      node.radius * birth * (1 + arc * 0.16) * settlePulse * fieldBlend,
    );

    const tether = Math.sin(Math.min(1, local / 0.93) * Math.PI) * birth;
    if (tether <= 0.002) return;

    for (let trailIndex = 1; trailIndex <= 4; trailIndex += 1) {
      const trailT = trailIndex / 5;
      liquidTrailPosition.copy(node.origin).lerp(liquidPosition, trailT);
      liquidTrailPosition.y += Math.sin(trailT * Math.PI) * 0.015 * tether;
      const taper = 0.42 + Math.sin(trailT * Math.PI) * 0.18;
      addLiquidBall(
        glyph,
        liquidTrailPosition,
        node.radius * taper * tether * fieldBlend,
      );
    }
  });

  glyph.effect.update();
  return progress;
}

type SpiderOrbThreeProps = {
  expression: Expression;
  expressionEpoch: number;
  repositionSignal: number;
  appearance?: OrbAppearance;
  actionMode?: OrbActionMode;
  actionEpoch?: number;
};

export default function SpiderOrbThree({
  expression,
  expressionEpoch,
  repositionSignal,
  appearance = "spider",
  actionMode = "face",
  actionEpoch = 0,
}: SpiderOrbThreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const expressionUpdaterRef = useRef<
    ((next: Expression, epoch: number) => void) | null
  >(null);
  const actionUpdaterRef = useRef<
    ((next: OrbActionMode, epoch: number) => void) | null
  >(null);
  const repositionRef = useRef<(() => void) | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasWebGlError, setHasWebGlError] = useState(false);
  const activeLabel =
    EXPRESSION_OPTIONS.find((option) => option.id === expression)?.label ??
    "Neutral";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: WebGLRenderer;

    try {
      renderer = new WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      queueMicrotask(() => setHasWebGlError(true));
      return;
    }

    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "orb-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.015, 4.2);

    const dragRoot = new Group();
    const head = new Group();
    const liquidOverlay = new Group();
    dragRoot.add(head);
    scene.add(dragRoot, liquidOverlay);

    const isWhale = appearance === "whale";
    const isAlien = appearance === "alien";
    const sphereMaterial = new MeshPhysicalMaterial({
      color: isWhale ? 0x4f67ff : isAlien ? 0x08090f : 0x030303,
      roughness: isAlien ? 0.36 : isWhale ? 0.6 : 0.34,
      metalness: 0,
      clearcoat: isAlien ? 0.6 : isWhale ? 0.08 : 0.68,
      clearcoatRoughness: isAlien ? 0.36 : isWhale ? 0.72 : 0.3,
      iridescence: 0,
      iridescenceIOR: 1.32,
      iridescenceThicknessRange: [180, 320],
    });
    const lensMaterial = new MeshPhysicalMaterial({
      color: isWhale ? 0x202840 : isAlien ? 0xfbfcff : 0xfafafa,
      roughness: isAlien ? 0.3 : 0.24,
      metalness: 0,
      clearcoat: isAlien ? 0.68 : 0.16,
      clearcoatRoughness: isAlien ? 0.28 : 0.5,
      iridescence: isAlien ? 0.16 : 0,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [130, 360],
      sheen: 0,
      sheenColor: isAlien ? 0x93a5ff : 0xffffff,
      sheenRoughness: 0.68,
      specularIntensity: 1,
      specularColor: isAlien ? 0xd7deff : 0xffffff,
      emissive: isAlien ? 0x49506c : 0x000000,
      emissiveIntensity: isAlien ? 0.032 : 0,
      side: DoubleSide,
    });
    const rimMaterial = new MeshPhysicalMaterial({
      color: isWhale ? 0x12182c : isAlien ? 0x03040a : 0x010101,
      roughness: isAlien ? 0.32 : 0.34,
      metalness: 0,
      clearcoat: isAlien ? 0.62 : 0.14,
      clearcoatRoughness: isAlien ? 0.31 : 0.3,
      side: DoubleSide,
    });
    const liquidMaterial = new MeshPhysicalMaterial({
      color: isWhale ? 0x425af0 : isAlien ? 0x08090f : 0x020202,
      roughness: isAlien ? 0.35 : 0.27,
      metalness: 0,
      clearcoat: isAlien ? 0.6 : 0.42,
      clearcoatRoughness: isAlien ? 0.35 : 0.34,
    });
    const actionMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      side: DoubleSide,
      toneMapped: false,
    });

    const sphere = new Mesh(
      new SphereGeometry(1, 96, 64),
      sphereMaterial,
    );
    const leftEye = createEyePatch(
      -1,
      lensMaterial,
      rimMaterial,
      POSES.neutral.left,
      appearance,
    );
    const rightEye = createEyePatch(
      1,
      lensMaterial,
      rimMaterial,
      POSES.neutral.right,
      appearance,
    );
    const liquidGlyphs = {
      thinking: createThinkingGlyph(liquidMaterial),
      doing: createDoingGlyph(liquidMaterial),
      surprised: createSurprisedGlyph(liquidMaterial),
    };
    const sendGlyph = createBackGlyph("send", actionMaterial);
    const stopGlyph = createBackGlyph("stop", actionMaterial);
    head.add(
      sphere,
      leftEye.group,
      rightEye.group,
      sendGlyph,
      stopGlyph,
    );
    liquidOverlay.add(
      liquidGlyphs.thinking.effect,
      liquidGlyphs.thinking.terminal,
      liquidGlyphs.doing.effect,
      liquidGlyphs.doing.terminal,
      liquidGlyphs.surprised.effect,
      liquidGlyphs.surprised.terminal,
    );

    if (isAlien) {
      RectAreaLightUniformsLib.init();
      scene.add(new AmbientLight(0xf0f2ff, 0.12));
      scene.add(new HemisphereLight(0x9eafff, 0x050509, 0.26));

      const softKey = new RectAreaLight(0xfffbf8, 2.05, 9.2, 8.2);
      softKey.position.set(-8.2, 8.4, 7.2);
      softKey.lookAt(-0.38, 0.32, 0);
      scene.add(softKey);

      const blueWrap = new RectAreaLight(0x7183ff, 0.82, 8.5, 8.5);
      blueWrap.position.set(4.8, 3.2, -4.2);
      blueWrap.lookAt(0.2, 0.05, 0);
      scene.add(blueWrap);

      const edgeLight = new DirectionalLight(0x8394ff, 0.11);
      edgeLight.position.set(3.2, 2.5, -4.5);
      scene.add(edgeLight);
    } else {
      scene.add(new AmbientLight(0xffffff, 0.42));

      const keyLight = new DirectionalLight(0xffffff, 2.7);
      keyLight.position.set(-3.8, 4.2, 5.5);
      scene.add(keyLight);

      const fillLight = new DirectionalLight(0xdde6f1, 0.62);
      fillLight.position.set(4.5, -0.8, 3.2);
      scene.add(fillLight);

      const rimLight = new DirectionalLight(0xffffff, 0.36);
      rimLight.position.set(1.5, 4.5, -3.5);
      scene.add(rimLight);
    }

    const mountedAt = performance.now();
    let activeExpression: Expression = "neutral";
    let expressionStartedAt = mountedAt;
    let hasSyncedExpression = false;
    let activeActionMode = actionMode;
    let actionStartedAt = actionEpoch > 0 ? actionEpoch : mountedAt;
    let actionYaw = actionMode === "face" || actionMode === "doing" ? 0 : Math.PI;
    let actionFromYaw = actionYaw;
    let actionTargetYaw = actionYaw;
    let currentPose = clonePose(POSES.neutral);
    let animationFrame = 0;
    let lastFrameTime = 0;
    let isIntersecting = true;
    let isDocumentVisible = document.visibilityState === "visible";
    let reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const targetQuaternion = new Quaternion();
    const yawQuaternion = new Quaternion();
    const pitchQuaternion = new Quaternion();
    const worldUp = new Vector3(0, 1, 0);
    const worldRight = new Vector3(1, 0, 0);
    const drag = {
      active: false,
      pointerId: -1,
      lastX: 0,
      lastY: 0,
    };

    const renderScene = () => renderer.render(scene, camera);

    const shouldAnimate = () =>
      !reducedMotion && isIntersecting && isDocumentVisible;

    const configureAction = (next: OrbActionMode, epoch: number) => {
      activeActionMode = next;
      actionFromYaw = actionYaw;
      actionStartedAt = epoch > 0 ? epoch : performance.now();
      const facing = next === "face" || next === "doing" ? 0 : Math.PI;
      actionTargetYaw = nextForwardFacing(actionYaw, facing);
      sendGlyph.visible = next === "send";
      stopGlyph.visible = next === "stop" || next === "doing";
    };

    const resolveActionYaw = (time: number) => {
      const elapsed = Math.max(0, time - actionStartedAt);
      const settle = smootherStep(elapsed / ACTION_SETTLE_MS);
      if (settle < 1 || activeActionMode !== "doing") {
        return MathUtils.lerp(actionFromYaw, actionTargetYaw, settle);
      }

      if (reducedMotion) return actionTargetYaw + Math.PI;
      const loopElapsed = elapsed - ACTION_SETTLE_MS;
      const loopIndex = Math.floor(loopElapsed / ACTION_LOOP_MS);
      const loopProgress = (loopElapsed % ACTION_LOOP_MS) / ACTION_LOOP_MS;
      return actionTargetYaw + loopIndex * FULL_TURN + loopTurnAt(loopProgress);
    };

    configureAction(activeActionMode, actionStartedAt);

    const applyPose = (time: number, snap = false) => {
      const elapsed = Math.max(0, time - expressionStartedAt);
      const target = dynamicTarget(activeExpression, elapsed);
      const delta = lastFrameTime
        ? Math.min((time - lastFrameTime) / 1000, 0.05)
        : 1 / 60;

      if (snap) {
        currentPose = clonePose(target);
      } else {
        const amount = 1 - Math.exp(-delta * 9.2);
        approachPose(currentPose, target, amount);
      }

      updateEyePatch(leftEye, currentPose.left);
      updateEyePatch(rightEye, currentPose.right);

      const resolvedExpression = resolveExpression(activeExpression, elapsed);
      const liquidPresence = Math.max(
        updateLiquidGlyph(
          liquidGlyphs.thinking,
          resolvedExpression === "thinking",
          delta,
          time,
          snap,
        ),
        updateLiquidGlyph(
          liquidGlyphs.doing,
          resolvedExpression === "doing",
          delta,
          time,
          snap,
        ),
        updateLiquidGlyph(
          liquidGlyphs.surprised,
          resolvedExpression === "surprised",
          delta,
          time,
          snap,
        ),
      );
      const framingAmount = snap ? 1 : 1 - Math.exp(-delta * 5.8);
      camera.position.z +=
        (4.2 + liquidPresence * 1.05 - camera.position.z) * framingAmount;
      camera.position.y +=
        (0.015 + liquidPresence * 0.15 - camera.position.y) * framingAmount;

      const motion = reducedMotion ? 0 : 1;
      head.scale.set(
        currentPose.headScaleX,
        currentPose.headScaleY,
        currentPose.headScaleZ,
      );
      // Keep status punctuation facing the viewer while the physical orb turns.
      liquidOverlay.scale.copy(head.scale);
      dragRoot.quaternion.slerp(
        targetQuaternion,
        snap || reducedMotion ? 1 : 1 - Math.exp(-delta * 18),
      );
      actionYaw = resolveActionYaw(time);
      container.dataset.rotationDegrees = String(
        Math.round(MathUtils.euclideanModulo(actionYaw, FULL_TURN) * 180 / Math.PI),
      );
      head.rotation.y =
        actionYaw +
        currentPose.headYaw +
        Math.sin(time * 0.00062) * 0.012 * motion;
      head.rotation.x =
        currentPose.headPitch +
        Math.sin(time * 0.00048 + 1.2) * 0.008 * motion;
      head.rotation.z =
        currentPose.headRoll + Math.sin(time * 0.00038) * 0.009 * motion;
      head.position.y =
        currentPose.lift + Math.sin(time * 0.00112) * 0.018 * motion;
      liquidOverlay.position.y = head.position.y;
      lastFrameTime = time;
    };

    const animate = (time: number) => {
      animationFrame = 0;
      applyPose(time);
      renderScene();

      if (shouldAnimate()) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const requestAnimation = () => {
      if (shouldAnimate() && animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(animate);
      } else if (!shouldAnimate() && animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };

    expressionUpdaterRef.current = (next, epoch) => {
      const isInitialSync = !hasSyncedExpression;
      hasSyncedExpression = true;
      activeExpression = next;
      expressionStartedAt = epoch > 0 ? epoch : performance.now();
      lastFrameTime = 0;

      if (reducedMotion || isInitialSync) {
        applyPose(performance.now(), true);
        renderScene();
      }
      requestAnimation();
    };

    actionUpdaterRef.current = (next, epoch) => {
      configureAction(next, epoch);
      lastFrameTime = 0;
      applyPose(performance.now(), reducedMotion);
      renderScene();
      requestAnimation();
    };

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width < 1 || height < 1) return;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderScene();
    };

    const commitRotation = () => {
      if (reducedMotion) {
        dragRoot.quaternion.copy(targetQuaternion);
        applyPose(performance.now(), true);
        renderScene();
      } else {
        requestAnimation();
      }
    };

    const rotateTarget = (yaw: number, pitch: number) => {
      yawQuaternion.setFromAxisAngle(worldUp, yaw);
      pitchQuaternion.setFromAxisAngle(worldRight, pitch);
      targetQuaternion
        .premultiply(yawQuaternion)
        .premultiply(pitchQuaternion)
        .normalize();
      commitRotation();
    };

    const resetRotation = () => {
      targetQuaternion.identity();
      commitRotation();
    };

    repositionRef.current = resetRotation;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      container.dataset.dragging = "true";
      container.setPointerCapture(event.pointerId);
      container.focus({ preventScroll: true });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) return;

      const deltaX = event.clientX - drag.lastX;
      const deltaY = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      if (deltaX === 0 && deltaY === 0) return;
      rotateTarget(deltaX * 0.0095, deltaY * 0.0095);
    };

    const endPointerDrag = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const pointerId = drag.pointerId;
      drag.active = false;
      drag.pointerId = -1;
      delete container.dataset.dragging;

      if (container.hasPointerCapture(pointerId)) {
        container.releasePointerCapture(pointerId);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const step = 0.18;

      if (event.key === "ArrowLeft") {
        rotateTarget(-step, 0);
      } else if (event.key === "ArrowRight") {
        rotateTarget(step, 0);
      } else if (event.key === "ArrowUp") {
        rotateTarget(0, -step);
      } else if (event.key === "ArrowDown") {
        rotateTarget(0, step);
      } else if (event.key.toLowerCase() === "r" || event.key === "Home") {
        resetRotation();
      } else {
        return;
      }

      event.preventDefault();
    };

    const handleVisibility = () => {
      isDocumentVisible = document.visibilityState === "visible";
      requestAnimation();
      if (!shouldAnimate()) renderScene();
    };

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      lastFrameTime = 0;

      if (reducedMotion) {
        dragRoot.quaternion.copy(targetQuaternion);
        applyPose(performance.now(), true);
        renderScene();
      }
      requestAnimation();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isIntersecting = entry?.isIntersecting ?? true;
      requestAnimation();
    });

    resizeObserver.observe(container);
    intersectionObserver.observe(container);
    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", endPointerDrag);
    container.addEventListener("pointercancel", endPointerDrag);
    container.addEventListener("lostpointercapture", endPointerDrag);
    container.addEventListener("dblclick", resetRotation);
    container.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);
    motionQuery.addEventListener("change", handleMotionPreference);

    applyPose(expressionStartedAt, true);
    resize();
    renderScene();
    const readyFrame = window.requestAnimationFrame(() => setIsReady(true));
    requestAnimation();

    return () => {
      window.cancelAnimationFrame(readyFrame);
      expressionUpdaterRef.current = null;
      actionUpdaterRef.current = null;
      repositionRef.current = null;
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", endPointerDrag);
      container.removeEventListener("pointercancel", endPointerDrag);
      container.removeEventListener("lostpointercapture", endPointerDrag);
      container.removeEventListener("dblclick", resetRotation);
      container.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibility);
      motionQuery.removeEventListener("change", handleMotionPreference);

      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        objectMaterials.forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [appearance]);

  useEffect(() => {
    expressionUpdaterRef.current?.(expression, expressionEpoch);
  }, [expression, expressionEpoch]);

  useEffect(() => {
    actionUpdaterRef.current?.(actionMode, actionEpoch);
  }, [actionEpoch, actionMode]);

  useEffect(() => {
    if (repositionSignal > 0) repositionRef.current?.();
  }, [repositionSignal]);

  return (
    <div
      ref={containerRef}
      className="orb-stage"
      data-engine="three"
      data-character={appearance}
      data-ready={isReady && !hasWebGlError ? "true" : "false"}
      data-expression={expression}
      data-action-mode={actionMode}
      role="img"
      tabIndex={0}
      title="同一颗 Three.js 球体：正面 Doing，背面 Send / Stop"
      aria-label={`同一颗可 360 度旋转的${appearance === "whale" ? "蓝色圆球" : appearance === "alien" ? "Alien Orb" : "Spider Orb"}，当前状态：${actionMode}，当前表情：${activeLabel}。白色 Send 与 Stop 是球体背面的三维标记。`}
    >
      <div
        className={`orb-fallback${appearance === "whale" ? " orb-fallback-whale" : appearance === "alien" ? " orb-fallback-alien" : ""}`}
        aria-hidden="true"
      >
        <span
          className={
            appearance === "whale"
              ? "whale-fallback-eye whale-fallback-eye-left"
              : "fallback-eye fallback-eye-left"
          }
        />
        <span
          className={
            appearance === "whale"
              ? "whale-fallback-eye whale-fallback-eye-right"
              : "fallback-eye fallback-eye-right"
          }
        />
      </div>
    </div>
  );
}
