(() => {
  "use strict";

  const { alphabet, createChain, decode, scoreWord } = window.CipherEngine;
  const byId = id => document.getElementById(id);
  const input = byId("cipher-input");
  const startButton = byId("decipher");
  const playButton = byId("play-pause");
  const stepButton = byId("step");
  const inspectPlayButton = byId("inspect-play");
  const inspectStepButton = byId("inspect-step");
  const speedSelect = byId("speed");
  const lambdaInput = byId("lambda");
  const wordDetail = byId("word-detail");
  const detailPrompt = wordDetail.textContent;
  const wordPairs = new WeakMap();
  let inspectedPair = [];
  const status = byId("run-status");
  const countFormat = new Intl.NumberFormat("en-US");
  const scoreFormat = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3, maximumFractionDigits: 3
  });
  const log = byId("noisy-log");
  const logLimit = 40;
  const empty = "—";
  const initialTranslation = byId("chain-text").textContent || empty;
  let chain = null;
  let lastProposal = null;
  let lambda = Number(lambdaInput.value);
  let running = false;
  let timer = null;
  let lastTick = 0;
  let fraction = 0;

  function write(id, value) {
    const el = byId(id);
    if (el && el.textContent !== value) el.textContent = value;
  }

  function setStatus(message, state) {
    if (status.textContent !== message) status.textContent = message;
    status.dataset.state = state;
  }

  function createKeyCells(id) {
    const container = byId(id);
    const fragment = document.createDocumentFragment();
    const cells = [...alphabet].map(letter => {
      const cell = document.createElement("span");
      cell.className = "key-cell";
      cell.setAttribute("role", "img");
      const source = document.createElement("span");
      source.className = "key-source";
      source.textContent = letter.toUpperCase();
      const target = document.createElement("span");
      target.className = "key-target";
      cell.append(source, target);
      fragment.append(cell);
      return { cell, source: source.textContent, target };
    });
    container.replaceChildren(fragment);
    return cells;
  }

  const beforeCells = createKeyCells("current-key");
  const proposedCells = createKeyCells("proposed-key");

  function drawKey(cells, key, swapped = []) {
    cells.forEach(({ cell, source, target }, index) => {
      const letter = key ? key[index].toUpperCase() : empty;
      const changed = swapped.includes(index);
      if (target.textContent !== letter) target.textContent = letter;
      cell.classList.toggle("is-swapped", changed);
      const description = key
        ? `Plaintext ${source} maps to ciphertext ${letter}${changed ? ", swapped" : ""}`
        : `${source}, pending`;
      cell.setAttribute("aria-label", description);
      cell.title = description;
    });
  }

  function drawDifferences(before, proposed) {
    const currentFragment = document.createDocumentFragment();
    const proposedFragment = document.createDocumentFragment();
    const scores = new Map();
    // Keep contractions together on screen. The language model scores each
    // uninterrupted A–Z run separately, with a space boundary on each side.
    function contribution(word) {
      if (!scores.has(word)) {
        let total = 0;
        for (const token of word.match(/[A-Za-z]+/g) || []) total += scoreWord(token, lambda).total;
        scores.set(word, total);
      }
      return scores.get(word);
    }
    const words = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
    let lastEnd = 0;
    for (const match of proposed.matchAll(words)) {
      const word = match[0];
      const end = match.index + word.length;
      const oldWord = before.slice(match.index, end);
      if (word === oldWord) continue;
      const fromScore = contribution(oldWord);
      const toScore = contribution(word);
      // Ignore rounding noise from summing exactly the same weights in a
      // different order when a pair changes places inside a word.
      const tolerance = 8 * Number.EPSILON * Math.max(1, Math.abs(fromScore), Math.abs(toScore));
      const rawDelta = toScore - fromScore;
      const delta = Math.abs(rawDelta) <= tolerance ? 0 : rawDelta;
      const size = Math.abs(delta);
      const direction = delta > 0 ? "gain" : delta < 0 ? "loss" : "tie";
      const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
      const magnitude = size > 0 && size < 0.0005 ? size.toPrecision(2) : scoreFormat.format(size);
      const change = {gain: "Higher", loss: "Lower", tie: "Equal"}[direction];
      const detail = `“${oldWord}” → “${word}” · ${change} score · ${scoreFormat.format(fromScore)} → ${scoreFormat.format(toScore)} (Δ ${sign}${magnitude})`;

      const oldMark = document.createElement("mark");
      oldMark.className = "word-before";
      oldMark.textContent = oldWord;
      oldMark.title = detail;
      currentFragment.append(before.slice(lastEnd, match.index), oldMark);

      const newMark = document.createElement("mark");
      newMark.className = "word-proposed";
      newMark.dataset.direction = direction;
      newMark.dataset.strength = delta === 0 ? "0" : size < 1 ? "1" : size < 3 ? "2" : "3";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "word-inspect";
      button.textContent = word;
      button.title = detail;
      button.setAttribute("aria-label", detail);
      newMark.append(button);
      wordPairs.set(button, [oldMark, newMark]);
      proposedFragment.append(proposed.slice(lastEnd, match.index), newMark);
      lastEnd = end;
    }
    currentFragment.append(before.slice(lastEnd));
    proposedFragment.append(proposed.slice(lastEnd));
    byId("current-text").replaceChildren(currentFragment);
    byId("proposed-text").replaceChildren(proposedFragment);
    if (lastEnd === 0) wordDetail.textContent = "This swap leaves every word unchanged.";
  }

  function formatAlpha(logAlpha) {
    if (logAlpha === 0) return "1";
    // Work in log space when the probability is too small for a JS number.
    const exponent = Math.floor(logAlpha / Math.LN10);
    if (exponent < -4) {
      const mantissa = Math.exp(logAlpha - exponent * Math.LN10);
      return `${Number(mantissa.toPrecision(4))}e${exponent}`;
    }
    return String(Number(Math.exp(logAlpha).toPrecision(6)));
  }

  function drawDecision(proposal) {
    let alpha = empty;
    let draw = empty;
    let outcome = "neutral";
    if (proposal) {
      alpha = formatAlpha(proposal.logAlpha);
      draw = String(Number(proposal.u.toPrecision(6)));
      // Show extra precision if rounding would put the draw on the threshold.
      if (Number(draw) === Number(alpha) || Number(draw) === 1 ||
          (Number(draw) < Number(alpha)) !== proposal.accepted) {
        draw = String(proposal.u);
        const probability = Math.exp(proposal.logAlpha);
        if (probability > 0) alpha = String(probability);
      }
      outcome = proposal.accepted ? "accepted" : "rejected";
    }
    write("acceptance", alpha);
    write("random-u", draw);
    write("decision", proposal ? (proposal.accepted ? "Accepted" : "Rejected") : empty);
    byId("decision").dataset.decision = outcome;
  }

  function render(proposal = null) {
    lastProposal = proposal;
    inspectedPair = [];
    wordDetail.textContent = detailPrompt;
    const currentKey = proposal ? proposal.currentKey : chain?.key;
    const before = currentKey ? decode(input.value, currentKey) : empty;
    drawKey(beforeCells, currentKey);
    drawKey(proposedCells, proposal?.proposedKey, proposal?.swapped);
    write("current-score", chain ? scoreFormat.format(proposal?.currentScore ?? chain.score) : empty);
    if (proposal) {
      const proposed = decode(input.value, proposal.proposedKey);
      drawDifferences(before, proposed);
      write("chain-text", proposal.accepted ? proposed : before);
    } else {
      write("current-text", before);
      write("proposed-text", empty);
      write("chain-text", chain ? before : initialTranslation);
    }
    write("iteration", countFormat.format(chain?.iteration ?? 0));
    write("accepted-count", countFormat.format(chain?.accepted ?? 0));
    write("chain-score", chain ? scoreFormat.format(chain.score) : empty);
    write("proposed-score", proposal ? scoreFormat.format(proposal.proposedScore) : empty);
    write("score-change", proposal ? scoreFormat.format(proposal.proposedScore - proposal.currentScore) : empty);
    write("swapped-letters", proposal ? proposal.swapped.map(i => alphabet[i].toUpperCase()).join(" and ") : empty);
    drawDecision(proposal);
    if (byId("best-text")) write("best-text", chain ? decode(input.value, chain.bestKey) : empty);
    write("best-score", chain ? scoreFormat.format(chain.bestScore) : empty);
  }

  function clearLog() {
    const placeholder = document.createElement("li");
    placeholder.className = "log-empty";
    placeholder.textContent = "Waiting for the first accepted proposal.";
    log.replaceChildren(placeholder);
  }

  function prependAccepted(entries) {
    if (!entries.length) return;
    if (log.firstElementChild?.classList.contains("log-empty")) log.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const { key, score, iteration } of entries.reverse()) {
      const item = document.createElement("li");
      const meta = document.createElement("span");
      meta.className = "log-meta";
      meta.textContent = `Step ${countFormat.format(iteration)} · Log score ${scoreFormat.format(score)}`;
      const translation = document.createElement("span");
      translation.className = "log-text";
      translation.textContent = decode(input.value, key);
      item.append(meta, translation);
      fragment.append(item);
    }
    log.prepend(fragment);
    while (log.children.length > logLimit) log.lastElementChild.remove();
  }

  function oneStep(replay) {
    const proposal = chain.step(replay);
    if (proposal.accepted) {
      prependAccepted([{ key: chain.key, score: chain.score, iteration: chain.iteration }]);
    }
    render(proposal);
    return proposal;
  }

  function hasLetters() {
    return /[a-z]/i.test(input.value);
  }

  function syncControls() {
    const valid = hasLetters();
    startButton.disabled = !valid || running;
    playButton.disabled = !chain;
    playButton.textContent = chain && !running ? "Resume" : "Pause";
    stepButton.disabled = !valid;
    inspectPlayButton.disabled = playButton.disabled;
    inspectPlayButton.textContent = playButton.textContent;
    inspectStepButton.disabled = stepButton.disabled;
  }

  function halt() {
    clearTimeout(timer);
    timer = null;
    running = false;
  }

  function scheduleBatch() {
    const rate = Number(speedSelect?.value) || 200;
    const interval = Math.max(125, 1000 / rate);
    timer = window.setTimeout(() => {
      if (!running) return;
      const now = performance.now();
      fraction += Math.min(now - lastTick, 2 * interval) * rate / 1000;
      lastTick = now;
      const due = Math.floor(fraction);
      const entries = [];
      const onAccepted = (key, score, iteration) => {
        entries.push({ key, score, iteration });
        if (entries.length > logLimit) entries.shift();
      };
      let done = 0;
      let proposal;
      while (done < due && (done === 0 || performance.now() - now < 18)) {
        const count = Math.min(8, due - done);
        proposal = chain.advance(count, onAccepted);
        done += count;
      }
      // Discard overdue work when this message costs more to score than the
      // chosen speed allows, so a long paste cannot build an unbounded queue.
      fraction -= due;
      if (proposal) {
        prependAccepted(entries);
        render(proposal);
      }
      scheduleBatch();
    }, interval);
  }

  function beginPlayback() {
    running = true;
    lastTick = performance.now();
    fraction = 0;
    syncControls();
    setStatus("Running", "running");
    scheduleBatch();
  }

  startButton.addEventListener("click", () => {
    if (!hasLetters()) return;
    halt();
    chain = createChain(input.value, {lambda});
    clearLog();
    oneStep();
    beginPlayback();
  });

  playButton.addEventListener("click", () => {
    if (!chain) return;
    if (running) {
      halt();
      syncControls();
      setStatus("Paused", "paused");
    } else {
      beginPlayback();
    }
  });

  stepButton.addEventListener("click", () => {
    if (!hasLetters()) return;
    halt();
    if (!chain) chain = createChain(input.value, {lambda});
    const proposal = oneStep();
    syncControls();
    setStatus(`Paused · Step ${countFormat.format(proposal.iteration)} ${proposal.accepted ? "accepted" : "rejected"}`, "paused");
  });

  speedSelect?.addEventListener("change", () => {
    if (running) {
      clearTimeout(timer);
      lastTick = performance.now();
      fraction = 0;
      scheduleBatch();
    }
  });

  function updateLambda() {
    const newLambda = Number(lambdaInput.value);
    write("lambda-value", newLambda.toFixed(2));
    if (newLambda === lambda) return;
    lambda = newLambda;
    if (!lastProposal) return;
    halt();
    const {currentKey, swapped, u} = lastProposal;
    chain = createChain(input.value, {key: currentKey, lambda});
    clearLog();
    oneStep({swapped, u});
    syncControls();
    setStatus("Paused · Same swap and draw at the new word weight", "paused");
  }

  // Native buttons support both keyboard and touch. Activating or tabbing to
  // a word freezes the live proposal so the displayed scores stay readable.
  function inspectWord(event) {
    const button = event.target.closest(".word-inspect");
    if (!button) return;
    if (running && event.type !== "pointerover") {
      halt();
      syncControls();
      setStatus("Paused", "paused");
    }
    for (const mark of inspectedPair) mark.classList.remove("is-inspected");
    inspectedPair = wordPairs.get(button);
    for (const mark of inspectedPair) mark.classList.add("is-inspected");
    wordDetail.textContent = button.title;
  }
  const proposedText = byId("proposed-text");
  proposedText.addEventListener("pointerover", inspectWord);
  proposedText.addEventListener("focusin", inspectWord);
  proposedText.addEventListener("click", inspectWord);
  lambdaInput.addEventListener("input", updateLambda);
  lambdaInput.addEventListener("change", updateLambda);

  function reset() {
    halt();
    chain = null;
    clearLog();
    render();
    syncControls();
    setStatus(hasLetters() ? "Ready" : "Enter ciphertext containing at least one letter A–Z.", hasLetters() ? "ready" : "empty");
  }

  inspectPlayButton.addEventListener("click", () => playButton.click());
  inspectStepButton.addEventListener("click", () => stepButton.click());

  input.addEventListener("input", reset);
  window.addEventListener("pagehide", () => {
    if (running) {
      halt();
      syncControls();
      setStatus("Paused", "paused");
    }
  });

  let transferred = null;
  if (window.location.hash.startsWith("#text=")) {
    transferred = new URLSearchParams(window.location.hash.slice(1)).get("text");
  } else if (window.location.hash === "#message") {
    try {
      transferred = sessionStorage.getItem("stats102c-cipher-transfer") || "";
      if (transferred) {
        // Keep this history entry usable after a reload while consuming the
        // transfer so another visit cannot accidentally reuse a stale message.
        window.history?.replaceState({ ...window.history.state, cipherMessage: transferred }, "");
        sessionStorage.removeItem("stats102c-cipher-transfer");
      } else {
        transferred = window.history?.state?.cipherMessage || "";
      }
    } catch {
      // The text box also supports pasting when storage is unavailable.
      transferred ??= window.history?.state?.cipherMessage || "";
    }
  }
  if (transferred !== null) input.value = transferred;
  updateLambda();
  reset();
})();
