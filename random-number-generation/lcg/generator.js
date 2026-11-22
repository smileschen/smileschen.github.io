export const presets = [
  { id: 'full', name: 'Full cycle', a: 5, b: 1, m: 8, seed: 2 },
  { id: 'short', name: 'Short cycle', a: 3, b: 1, m: 8, seed: 2 },
  { id: 'fixed', name: 'Fixed point', a: 2, b: 1, m: 8, seed: 2 },
  { id: 'digits', name: 'Decimal digits', a: 1, b: 7, m: 10, seed: 2 },
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
