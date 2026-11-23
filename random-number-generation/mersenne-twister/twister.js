export const INITIAL_WORDS = Object.freeze([
  0b10110, 0b01101, 0b01010, 0b00111, 0b11001, 0b00011, 0b10010,
]);

// The oldest, next, and fourth-oldest words occupy fixed slots until write-back.
export function computeUpdate(words, head) {
  const oldest = words[head];
  const neighbor = words[(head + 1) % 7];
  const offset = words[(head + 3) % 7];
  const joined = (oldest & 0b10000) | (neighbor & 0b01111);
  const dropped = joined & 1;
  const shifted = joined >>> 1;
  const mask = 0b10101;
  const twisted = dropped ? shifted ^ mask : shifted;
  const newWord = twisted ^ offset;
  return { oldest, neighbor, offset, joined, shifted, dropped, mask, twisted, newWord };
}

export function applyUpdate(words, head) {
  const nextWords = words.slice();
  nextWords[head] = computeUpdate(words, head).newWord;
  return { words: nextWords, head: (head + 1) % 7 };
}

// This teaching model tempers an output copy with two invertible five-bit steps.
export function temper(word) {
  const right = word >>> 2;
  const first = word ^ right;
  const left = (first << 1) & 0b11111;
  const mask = 0b10110;
  const masked = left & mask;
  const output = first ^ masked;
  return { right, first, left, mask, masked, output };
}
