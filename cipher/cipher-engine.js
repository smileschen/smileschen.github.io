/* Substitution cipher and Metropolis sampler.
   Every displayed key gives the ciphertext letters assigned to plaintext A–Z. */
(function (root) {
  "use strict";

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const space = 26;
  const width = 27;
  const defaultLambda = 0.07;

  function languageModel() {
    const model = root.CipherModel ||
      (typeof module !== "undefined" && module.exports && require("./cipher-model.js"));
    if (!model) throw new Error("Load the language model before deciphering.");
    return model;
  }

  function validateLambda(lambda) {
    if (!Number.isFinite(lambda) || lambda < 0) {
      throw new RangeError("The word weight must be a finite nonnegative number.");
    }
  }

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

  function logWordWeight(decoded, model) {
    return model.logWords.get(decoded) ?? model.unknownWord;
  }

  // Capture the individual terms only when a student opens a word breakdown.
  function scoreToken(decoded, lambda, model, pairs) {
    let previous = space;
    let pairScore = 0;
    for (let i = 0; i <= decoded.length; i++) {
      const next = i < decoded.length ? decoded.charCodeAt(i) - 65 : space;
      const logProbability = model.logPairs[previous * width + next];
      pairScore += logProbability;
      if (pairs) pairs.push({from: previous, to: next, probability: Math.exp(logProbability), logProbability});
      previous = next;
    }
    const wordScore = logWordWeight(decoded, model);
    return {pairScore, wordScore, total: pairScore + lambda * wordScore};
  }

  function scoreWord(word, lambda = defaultLambda) {
    validateLambda(lambda);
    if (typeof word !== "string" || !/^[A-Za-z]+$/.test(word)) {
      throw new TypeError("Score one decoded A–Z word at a time.");
    }
    return scoreToken(word.toUpperCase(), lambda, languageModel());
  }

  const neighborCount = 4;
  let frequencyGroups;

  function nearbyWords(decoded, target, model) {
    if (!frequencyGroups) {
      // For ties we need at most four examples plus the selected word.
      const groups = new Map();
      for (const [word, weight] of model.logWords) {
        if (!/^[A-Z]+$/.test(word)) continue;
        if (!groups.has(weight)) groups.set(weight, []);
        const tied = groups.get(weight);
        if (tied.length <= neighborCount) tied.push(word);
      }
      frequencyGroups = Array.from(groups, ([weight, words]) => ({weight, words}));
      frequencyGroups.sort((first, second) => first.weight - second.weight);
    }
    // Find the first group at or above this word's log probability, then
    // walk outward in order of absolute log-probability difference.
    let low = 0;
    let high = frequencyGroups.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (frequencyGroups[mid].weight < target) low = mid + 1;
      else high = mid;
    }
    let left = low - 1;
    let right = low;
    const neighbors = [];
    while (neighbors.length < neighborCount && (left >= 0 || right < frequencyGroups.length)) {
      const lower = frequencyGroups[left];
      const upper = frequencyGroups[right];
      const group = !upper || (lower && target - lower.weight <= upper.weight - target)
        ? frequencyGroups[left--] : frequencyGroups[right++];
      for (const word of group.words) {
        if (word !== decoded) {
          neighbors.push({word: word.toLowerCase(), probability: Math.exp(group.weight)});
          if (neighbors.length === neighborCount) break;
        }
      }
    }
    return neighbors;
  }

  function explainWord(displayWord, lambda = defaultLambda) {
    validateLambda(lambda);
    const model = languageModel();
    const tokens = [];
    let pairScore = 0;
    let wordScore = 0;
    // Apostrophes and other separators create separate scored tokens, just
    // as they do when preparing the complete message for the sampler.
    for (const word of displayWord.match(/[A-Za-z]+/g) || []) {
      const decoded = word.toUpperCase();
      const pairs = [];
      const score = scoreToken(decoded, lambda, model, pairs);
      tokens.push({
        word, pairs, ...score, known: model.logWords.has(decoded),
        probability: Math.exp(score.wordScore), logProbability: score.wordScore,
        neighbors: nearbyWords(decoded, score.wordScore, model)
      });
      pairScore += score.pairScore;
      wordScore += score.wordScore;
    }
    return {pairScore, wordScore, total: pairScore + lambda * wordScore, tokens};
  }

  function scoreText(prepared, inverse, model, lambda) {
    let pairScore = 0;
    for (const {from, to, count} of prepared.pairs) {
      const pair = inverse[from] * width + inverse[to];
      pairScore += count * model.logPairs[pair];
    }
    if (lambda === 0) return pairScore;
    let wordScore = 0;
    for (const {symbols, count} of prepared.words) {
      let decoded = "";
      for (let i = 0; i < symbols.length; i++) decoded += alphabet[inverse[symbols[i]]];
      wordScore += count * logWordWeight(decoded, model);
    }
    return pairScore + lambda * wordScore;
  }

  function createChain(text, {rng = Math.random, key: initialKey, lambda = defaultLambda} = {}) {
    validateLambda(lambda);
    const model = languageModel();
    const prepared = prepareText(text);
    const key = validateKey(initialKey ?? randomKey(rng)).split("");
    const inverse = new Uint8Array(width);
    inverse[space] = space;
    key.forEach((letter, i) => { inverse[letter.charCodeAt(0) - 65] = i; });
    let score = scoreText(prepared, inverse, model, lambda);
    let bestScore = score;
    let bestKey = key.join("");
    let iteration = 0;
    let accepted = 0;

    function runProposals(count, onAccepted, replay) {
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new RangeError("Advance by a positive whole number of proposals.");
      }
      let last;
      for (let step = 1; step <= count; step++) {
        let first, second;
        if (replay) {
          [first, second] = replay.swapped;
        } else {
          first = Math.floor(rng() * 26);
          second = Math.floor(rng() * 25);
          if (second >= first) second++;
        }
        const cipherA = key[first].charCodeAt(0) - 65;
        const cipherB = key[second].charCodeAt(0) - 65;
        inverse[cipherA] = second;
        inverse[cipherB] = first;

        const proposedScore = scoreText(prepared, inverse, model, lambda);
        const logAlpha = Math.min(0, proposedScore - score);
        const u = replay ? replay.u : rng();
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

    // Replaying a displayed swap and uniform draw lets the inspector vary
    // lambda while holding both the candidate and the random draw fixed.
    function step(replay) {
      if (replay !== undefined) {
        const swap = replay?.swapped;
        if (!Array.isArray(swap) || swap.length !== 2 || swap[0] === swap[1] ||
            ![...swap].every(i => Number.isInteger(i) && i >= 0 && i < alphabet.length)) {
          throw new RangeError("Replay requires two distinct key column indices.");
        }
        if (!Number.isFinite(replay.u) || replay.u < 0 || replay.u >= 1) {
          throw new RangeError("A replay draw must be in [0, 1).");
        }
      }
      return runProposals(1, undefined, replay);
    }

    return {
      step,
      advance: (count, onAccepted) => runProposals(count, onAccepted),
      get lambda() { return lambda; },
      get iteration() { return iteration; },
      get accepted() { return accepted; },
      get key() { return key.join(""); },
      get score() { return score; },
      get bestKey() { return bestKey; },
      get bestScore() { return bestScore; }
    };
  }

  const api = {alphabet, defaultLambda, randomKey, translate, decode, scoreWord, explainWord, createChain};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CipherEngine = api;
})(globalThis);
