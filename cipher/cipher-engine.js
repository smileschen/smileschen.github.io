/* Substitution cipher and Metropolis sampler from the Stats 102C cipher lectures.
   Every displayed key gives the ciphertext letters assigned to plaintext A–Z. */
(function (root) {
  "use strict";

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const space = 26;
  const width = 27;
  const wordWeight = 0.07;

  function validateKey(key) {
    if (typeof key !== "string" || !/^[A-Za-z]{26}$/.test(key) ||
        new Set(key.toUpperCase()).size !== 26) {
      throw new TypeError("A key must be a permutation of the 26 letters.");
    }
    return key.toUpperCase();
  }

  function randomKey(rng = Math.random) {
    const letters = alphabet.split("");
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    return letters.join("");
  }

  function translate(text, key) {
    const upperKey = validateKey(key);
    const lowerKey = upperKey.toLowerCase();
    return text.replace(/[A-Za-z]/g, letter => {
      const code = letter.charCodeAt(0);
      return code >= 97 ? lowerKey[code - 97] : upperKey[code - 65];
    });
  }

  function decode(text, key) {
    const forward = validateKey(key);
    const inverse = Array(26);
    for (let i = 0; i < 26; i++) inverse[forward.charCodeAt(i) - 65] = alphabet[i];
    return translate(text, inverse.join(""));
  }

  // Bijections preserve repetitions. Count the distinct ciphertext words and
  // adjacent symbol pairs once, including the leading and trailing spaces.
  function prepareText(text) {
    const tokens = text.match(/[A-Za-z]+/g) || [];
    const pairCounts = new Uint32Array(width * width);
    const wordCounts = new Map();
    for (const token of tokens) {
      const word = token.toUpperCase();
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      let previous = space;
      for (let i = 0; i < word.length; i++) {
        const next = word.charCodeAt(i) - 65;
        pairCounts[previous * width + next]++;
        previous = next;
      }
      pairCounts[previous * width + space]++;
    }
    const pairs = [];
    for (let i = 0; i < pairCounts.length; i++) {
      if (pairCounts[i]) {
        pairs.push({from: Math.floor(i / width), to: i % width, count: pairCounts[i]});
      }
    }
    const words = Array.from(wordCounts, ([word, count]) => ({
      symbols: Uint8Array.from(word, letter => letter.charCodeAt(0) - 65), count
    }));
    return {pairs, words};
  }

  function scoreText(prepared, inverse, model) {
    let pairScore = 0;
    for (const {from, to, count} of prepared.pairs) {
      const pair = inverse[from] * width + inverse[to];
      pairScore += count * model.logPairs[pair];
    }
    let wordScore = 0;
    for (const {symbols, count} of prepared.words) {
      let decoded = "";
      for (let i = 0; i < symbols.length; i++) decoded += alphabet[inverse[symbols[i]]];
      const logWeight = model.logWords.get(decoded) ?? model.unknownWord;
      wordScore += count * logWeight;
    }
    return pairScore + wordWeight * wordScore;
  }

  function createChain(text, {rng = Math.random, key: initialKey} = {}) {
    const model = root.CipherModel ||
      (typeof module !== "undefined" && module.exports && require("./cipher-model.js"));
    if (!model) throw new Error("Load the lecture language model before deciphering.");
    const prepared = prepareText(text);
    const key = validateKey(initialKey ?? randomKey(rng)).split("");
    const inverse = new Uint8Array(width);
    inverse[space] = space;
    key.forEach((letter, i) => { inverse[letter.charCodeAt(0) - 65] = i; });
    let score = scoreText(prepared, inverse, model);
    let bestScore = score;
    let bestKey = key.join("");
    let iteration = 0;
    let accepted = 0;

    function advance(count, onAccepted) {
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new RangeError("Advance by a positive whole number of proposals.");
      }
      let last;
      for (let step = 1; step <= count; step++) {
        const first = Math.floor(rng() * 26);
        let second = Math.floor(rng() * 25);
        if (second >= first) second++;
        const cipherA = key[first].charCodeAt(0) - 65;
        const cipherB = key[second].charCodeAt(0) - 65;
        inverse[cipherA] = second;
        inverse[cipherB] = first;

        const proposedScore = scoreText(prepared, inverse, model);
        const logAlpha = Math.min(0, proposedScore - score);
        const u = rng();
        const accept = Math.log(u) < logAlpha;
        iteration++;
        if (step === count) {
          const proposal = key.slice();
          [proposal[first], proposal[second]] = [proposal[second], proposal[first]];
          last = {
            iteration, currentKey: key.join(""), proposedKey: proposal.join(""),
            currentScore: score, proposedScore, swapped: [first, second],
            logAlpha, u, accepted: accept
          };
        }
        if (accept) {
          [key[first], key[second]] = [key[second], key[first]];
          accepted++;
          score = proposedScore;
          if (score > bestScore) {
            bestScore = score;
            bestKey = key.join("");
          }
          if (onAccepted) onAccepted(key.join(""), score, iteration);
        } else {
          inverse[cipherA] = first;
          inverse[cipherB] = second;
        }
      }
      return last;
    }

    return {
      step: () => advance(1),
      advance,
      get iteration() { return iteration; },
      get accepted() { return accepted; },
      get key() { return key.join(""); },
      get score() { return score; },
      get bestKey() { return bestKey; },
      get bestScore() { return bestScore; }
    };
  }

  const api = {alphabet, randomKey, translate, decode, createChain};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CipherEngine = api;
})(globalThis);
