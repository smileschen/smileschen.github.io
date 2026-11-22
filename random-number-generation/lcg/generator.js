export const presets = [
  { id: 'full', name: 'Full cycle', a: 5, b: 1, m: 8, seed: 2 },
  { id: 'short', name: 'Short cycle', a: 3, b: 1, m: 8, seed: 2 },
  { id: 'fixed', name: 'Fixed point', a: 2, b: 1, m: 8, seed: 2 },
  { id: 'digits', name: 'Decimal digits', a: 1, b: 7, m: 10, seed: 2 },
  {
    id: 'prime17', name: 'Prime modulus · m = 17', a: 5, b: 0, m: 17, seed: 1,
    observation: 'The cycle visits every nonzero value. Try a seed of 0 to see why it forms its own cycle.',
  },
  {
    id: 'power32-zero', name: 'm = 2⁵ · zero increment', a: 5, b: 0, m: 32, seed: 1,
    observation: 'Every value is one more than a multiple of 4. Multiplying by 5 preserves that pattern.',
  },
  {
    id: 'power32-one', name: 'm = 2⁵ · increment 1', a: 5, b: 1, m: 32, seed: 1,
    observation: 'Adding 1 after multiplying by 5 makes odd and even values alternate.',
  },
];

export function getOrbit({ a, b, m, seed }) {
  const values = [];
  const firstVisit = new Map();
  let state = seed;

  while (!firstVisit.has(state)) {
    firstVisit.set(state, values.length);
    values.push(state);
    state = (a * state + b) % m;
  }

  const repeatIndex = firstVisit.get(state);
  const period = values.length - repeatIndex;
  values.push(state);
  return { values, repeatIndex, period };
}

export function pointOnRule(a, b, startInput, current, progress) {
  const x = progress === 1 ? current : startInput + (current - startInput) * progress;
  const height = a * x + b;
  // An exact wrap belongs at zero, including when a fractional starting x
  // puts the computed height a few floating-point bits below the boundary.
  const nearest = Math.round(height);
  const raw = Math.abs(height - nearest) <= 4 * Number.EPSILON * Math.max(1, height) ? nearest : height;
  return { x, raw };
}
