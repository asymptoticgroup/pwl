// A helper type for the valid indices of a non-primitive
type Coordinate = string | symbol | number;

// A helper type that guarantees the indexable set X corresponds to numbers
type NumberList<X extends Coordinate> = { [_ in X]: number }[];

// A brand that we apply to the list element coordinates
declare const Monotone: unique symbol;
type IsMonotone = { [Monotone]: never };

// A helper type when we're constructing new points
type OnlyXY<
  X extends Coordinate,
  Y extends Coordinate,
  F extends NumberList<X | Y>
> = Pick<F[number], X | Y>[];

/**
 * A brand that is applied to the coordinate of a point list if the list as a
 * whole is sorted with respect to this coordinate.
 *
 * Most operations in this library require the independent variable (X) to be
 * sorted in a weakly monotone nature. We could create a runtime wrapper with a
 * constructor guarantee of this property, but that annotation is lost during
 * (de)serialization. Instead, we rely on the caller to assert monotonicity,
 * but leverage branded types to aid the caller in this task.
 */
export type Monotone<X extends Coordinate, F extends NumberList<X>> = F &
  { [_ in X]: IsMonotone }[];

/**
 * Checks whether a curve is weakly monotone increasing in the specified coordinate
 * @param curve The list of points to consider
 * @param x The coordinate to inspect
 * @returns A boolean predicate
 */
export function isMonotone<X extends Coordinate, F extends NumberList<X>>(
  curve: F,
  x: X
): curve is Monotone<X, F> {
  let x0 = Number.NEGATIVE_INFINITY;
  for (const point of curve) {
    const x1 = point[x];
    if (x1 < x0) {
      return false;
    }
    x0 = x1;
  }
  return true;
}

/**
 * Sorts a curve in ascending order, relative to a specified coordinate
 * @param curve The curve to sort
 * @param x The coordinate to sort against
 * @returns The sorted curve
 */
export function sort<X extends Coordinate, F extends NumberList<X>>(
  curve: F,
  x: X
): Monotone<X, F> {
  return curve.concat().sort((a, b) => a[x] - b[x]) as unknown as Monotone<
    X,
    F
  >;
}

/**
 * Removes any redundant, collinear points from the curve
 * @param curve The curve to reduce
 * @param x The x-coordinate
 * @param y The y-coordinate
 * @returns A copy of the curve, with collinear points removed
 */
export function reduce<
  X extends Coordinate,
  Y extends Coordinate,
  F extends Monotone<X, NumberList<X | Y>>
>(curve: F, x: X, y: Y): F {
  const reduced = [] as unknown as F;
  if (curve.length > 0) {
    reduced.push(curve.at(0)!);
    for (let i = 1; i < curve.length - 1; i++) {
      const { [x]: x0, [y]: y0 } = curve[i - 1];
      const { [x]: x1, [y]: y1 } = curve[i];
      const { [x]: x2, [y]: y2 } = curve[i + 1];
      if ((x2 - x0) * (y1 - y0) !== (x1 - x0) * (y2 - y0)) {
        reduced.push(curve[i]);
      }
    }
    reduced.push(curve.at(-1)!);
  }
  return reduced;
}

/**
 * Splits a curve at a specific location and translates the two pieces relative
 * to this location
 * @param curve The curve to split
 * @param x The x-coordinate
 * @param y The y-coordinate
 * @param x0 The location to split at
 * @returns The left- and right-sides of the split
 */
export function split<
  X extends Coordinate,
  Y extends Coordinate,
  F extends Monotone<X, NumberList<X | Y>>
>(curve: F, x: X, y: Y, x0: number): [OnlyXY<X, Y, F>, OnlyXY<X, Y, F>] {
  type Output = OnlyXY<X, Y, F>;

  // We partition the points of the curve into 3 bins
  const neg: Output = [];
  const mid: Output = [];
  const pos: Output = [];

  for (const p of curve) {
    // Note that we "lose" any additional properties of F since we are
    // creating new points but only know about X and Y. Mutating in place
    // would not solve the problem, since below we are possibly
    // interpolating an entirely new point.
    (p[x] < x0 ? neg : p[x] > x0 ? pos : mid).push({
      [x]: p[x] - x0,
      [y]: p[y],
    } as Output[number]);
  }

  if (mid.length === 0) {
    // If there are no points precisely at x0, we might need to interpolate
    if (neg.length > 0 && pos.length > 0) {
      const p = _interpolate(neg.at(-1)!, pos.at(0)!, x, y, 0);
      neg.push(p);
      pos.unshift(p);
    }
  } else {
    neg.push(mid.at(0)!);
    pos.unshift(mid.at(-1)!);
  }

  return [neg, pos] as const;
}

/**
 * Truncates the domain of the the curve to the provided interval.
 * @param curve The curve to truncate
 * @param min The left boundary point
 * @param max The right boundary point
 * @returns The truncated curve, or null if there was no intersection of domains
 */
export function truncate<
  X extends Coordinate,
  Y extends Coordinate,
  F extends Monotone<X, NumberList<X | Y>>
>(curve: F, x: X, y: Y, min: number, max: number): OnlyXY<X, Y, F> {
  type Output = OnlyXY<X, Y, F>;

  // We partition the points of the curve into 3 bins
  const neg: Output = [];
  const mid: Output = [];
  const pos: Output = [];

  for (const { [x]: x0, [y]: y0 } of curve) {
    (x0 < min ? neg : x0 > max ? pos : mid).push({
      [x]: x0,
      [y]: y0,
    } as Output[number]);
  }

  if (neg.length > 0) {
    // If we have points to the left, we might need to interpolate a boundary point
    const rhs = mid.at(0) ?? pos.at(0);
    if (rhs && rhs[x] > min) {
      // Is there a point to interpolate with? No need if rhs[x] === min.
      mid.unshift(_interpolate(neg.at(-1)!, rhs, x, y, min));
    }
  }

  if (pos.length > 0) {
    // If we have points to the right, we might need to interpolate a boundary point
    const lhs = mid.at(-1) ?? neg.at(-1);
    if (lhs && lhs[x] < max) {
      // Is there a point to interpolate with? No need if lhs[x] === max.
      mid.push(_interpolate(lhs, pos.at(0)!, x, y, max));
    }
  }

  return mid;
}

/**
 * Sums the provided curves using constant extrapolation to extend the domains
 * to +/- infinity.
 * @param curves The curves to sum
 * @param x The x-coordinate
 * @param y The y-coordinate
 * @returns The summed curve
 */
export function sum<
  X extends Coordinate,
  Y extends Coordinate,
  F extends Monotone<X, NumberList<X | Y>>
>(curves: F[], x: X, y: Y): OnlyXY<X, Y, F> {
  // This is a fairly standard work-efficient fold reduction with commutative/associated operations
  const current = curves.concat() as unknown as OnlyXY<X, Y, F>[];
  let gap = current.length;
  while (gap > 1) {
    gap = (gap + 1) >> 1;
    for (let i = 0; i < gap; i++) {
      current[i] = _sum2(current[i], current.at(i + gap) ?? [], x, y);
    }
  }
  return current.at(0) ?? ([] as (typeof current)[number]);
}

// Internal use only, implements the sum reduction for the fold.
function _sum2<
  X extends Coordinate,
  Y extends Coordinate,
  F extends Monotone<X, NumberList<X | Y>>
>(a: F, b: F, x: X, y: Y) {
  type Output = Pick<F[number], X | Y>[];
  const output: Output = [];

  // These are cursors representing what index we're "before". That is, i=0
  // implies the cursor for curve `a` is just before the point at a[0].
  let i = 0;
  let j = 0;

  // We extrapolate to the left and right for each curve
  let a0 = {
    [x]: Number.NEGATIVE_INFINITY,
    [y]: a.at(0)?.[y] ?? 0,
  } as Output[number];
  let b0 = {
    [x]: Number.NEGATIVE_INFINITY,
    [y]: b.at(0)?.[y] ?? 0,
  } as Output[number];
  let a1 = {
    [x]: a.at(0)?.[x] ?? Number.POSITIVE_INFINITY,
    [y]: a0[y],
  } as Output[number];
  let b1 = {
    [x]: b.at(0)?.[x] ?? Number.POSITIVE_INFINITY,
    [y]: b0[y],
  } as Output[number];

  // Note the strange looping condition. The way to read it is as follows:
  // "While there are points to consider, do [loop block]."
  // Inside the loop block, only advanced points if it would be valid to do so.
  // Otherwise, we preserve the extrapolated endpoints.
  while (i < a.length || j < b.length) {
    // Assumption: a0, b0 have been incorporated into the aggregate,
    // so we just need to consider the "first" x between a1 and b1
    const x1 = Math.min(a1[x], b1[x]);
    let y1 = 0;

    if (a1[x] === x1) {
      y1 += a1[y];
      // Increment the pointer
      i++;
      a0 = a1;
      a1 = (
        i === a.length ? { [x]: Number.POSITIVE_INFINITY, [y]: a0[y] } : a[i]
      ) as Output[number];
    } else {
      y1 += _interpolate(a0, a1, x, y, x1)[y];
      // Do not increment the pointer
    }

    if (b1[x] === x1) {
      y1 += b1[y];
      // Increment the pointer
      j++;
      b0 = b1;
      b1 = (
        j === b.length ? { [x]: Number.POSITIVE_INFINITY, [y]: b0[y] } : b[j]
      ) as Output[number];
    } else {
      y1 += _interpolate(b0, b1, x, y, x1)[y];
      // Do not increment the pointer
    }

    output.push({ [x]: x1, [y]: y1 } as Output[number]);
  }

  return output;
}

// Internal use only. Callers beware, there is a silent/unchecked assumption that a[x] !== b[x].
// Failure to observe this invariant will result in NaN propagation!
function _interpolate<
  X extends Coordinate,
  Y extends Coordinate,
  P extends NumberList<X | Y>[number]
>(a: P, b: P, x: X, y: Y, xval: number) {
  const { [x]: x0, [y]: y0 } = a;
  const { [x]: x1, [y]: y1 } = b;
  const dx = x1 - x0;
  const dy = y1 - y0;

  if (dx === 0) {
    return { [x]: xval, [y]: Number.NaN } as P;
  } else if (Number.isFinite(x0)) {
    return { [x]: xval, [y]: y0 + ((xval - x0) / dx) * dy } as P;
  } else {
    return { [x]: xval, [y]: y0 } as P;
  }
}
