import { assert, assertObjectMatch } from "jsr:@std/assert";
import * as pwl from "./mod.ts";

Deno.test("Test Predicate", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 6, y: -5 },
  ];

  assert(pwl.isMonotone(points, "x"));
  assert(!pwl.isMonotone(points, "y"));
});

Deno.test("Test Sort", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 6, y: -5 },
  ];

  const sorted = pwl.sort(points, "y");
  assert(!pwl.isMonotone(sorted, "x"));
  assert(pwl.isMonotone(sorted, "y"));
});

Deno.test("Test empty curves", () => {
  assert(pwl.isMonotone([], "x"));
  assert(pwl.isMonotone([{ x: 0, y: 0 }], "x"));
});

Deno.test("Test reduction", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ] as pwl.Monotone<"x", { x: number; y: number }[]>;

  const simplified = pwl.reduce(points, "x", "y");
  assert(
    JSON.stringify(simplified) ===
      JSON.stringify([
        { x: 0, y: 0 },
        { x: 2, y: 2 },
      ])
  );
});

Deno.test("Test split", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ] as pwl.Monotone<"x", { x: number; y: number }[]>;

  const [lhs, rhs] = pwl.split(points, "x", "y", 1);
  assert(lhs.length === 2 && rhs.length === 2);
  assertObjectMatch(lhs[0], { x: -1, y: 0 });
  assertObjectMatch(lhs[1], { x: 0, y: 1 });
  assertObjectMatch(rhs[0], { x: 0, y: 1 });
  assertObjectMatch(rhs[1], { x: 1, y: 2 });
});

Deno.test("Test split w/ interpolation", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 2, y: 2 },
  ] as pwl.Monotone<"x", { x: number; y: number }[]>;

  const [lhs, rhs] = pwl.split(points, "x", "y", 1);
  assert(lhs.length === 2 && rhs.length === 2);
  assertObjectMatch(lhs[0], { x: -1, y: 0 });
  assertObjectMatch(lhs[1], { x: 0, y: 1 });
  assertObjectMatch(rhs[0], { x: 0, y: 1 });
  assertObjectMatch(rhs[1], { x: 1, y: 2 });
});

Deno.test("Test split w/ extrapolation", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 2, y: 2 },
  ] as pwl.Monotone<"x", { x: number; y: number }[]>;

  const [lhs, rhs] = pwl.split(points, "x", "y", 3);
  assert(lhs.length === 2 && rhs.length === 0);
  assertObjectMatch(lhs[0], { x: -3, y: 0 });
  assertObjectMatch(lhs[1], { x: -1, y: 2 });
});

Deno.test("Test truncate", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 3, y: 3 },
  ] as pwl.Monotone<"x", { x: number; y: number }[]>;

  const truncated = pwl.truncate(points, "x", "y", 1, 2);
  assert(truncated.length === 2);
  assertObjectMatch(truncated[0], { x: 1, y: 1 });
  assertObjectMatch(truncated[1], { x: 2, y: 2 });
});

Deno.test("Test truncate w/ extrapolation", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 3, y: 3 },
  ] as pwl.Monotone<"x", { x: number; y: number }[]>;

  const truncated = pwl.truncate(points, "x", "y", 1, 4);
  assert(truncated.length === 2);
  assertObjectMatch(truncated[0], { x: 1, y: 1 });
  assertObjectMatch(truncated[1], { x: 3, y: 3 });
});

Deno.test("Test summation", () => {
  const a = [
    { q: 0, p: 5 },
    { q: 1, p: 6 },
  ] as pwl.Monotone<"p", { q: number; p: number }[]>;

  const b = [
    { q: 0, p: 7 },
    { q: 1, p: 8 },
  ] as pwl.Monotone<"p", { q: number; p: number }[]>;

  const response = pwl.sum([a, b], "p", "q");
  assert(response.length === 4);
  assertObjectMatch(response[0], { p: 5, q: 0 });
  assertObjectMatch(response[1], { p: 6, q: 1 });
  assertObjectMatch(response[2], { p: 7, q: 1 });
  assertObjectMatch(response[3], { p: 8, q: 2 });
});

// More tests todo. In particular, we should investigate thoroughly edge cases
// with horizontal or vertical segments, as well as "non-reduced" curves.

Deno.test("Test duplicated point collinearity", () => {
  const curve = [
    { x: 5, y: -2 },
    { x: 10, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ] as pwl.Monotone<"x", { x: number; y: number }[]>;

  const simple = pwl.reduce(curve, "x", "y");
  assert(simple.length === 3);
  assertObjectMatch(simple[0], curve[0]);
  assertObjectMatch(simple[1], curve[1]);
  assertObjectMatch(simple[2], curve[3]);
});
