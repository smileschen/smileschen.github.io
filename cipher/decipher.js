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
  const scoreDetails = byId("score-inspector");
  const scorePanel = window.CipherScoreInspector;
  const wordPicker = byId("score-word-picker");
  const wordControl = byId("score-word-control");
  const example = {before: "CUESTION", proposed: "QUESTION", example: true};
  const displayedWords = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
  const changedWords = new Map();
  let pickerWords = null;
  let highlightedWord = null;
  let selectedOffset = null;
  let panelWord = null;
  let panelLambda = null;
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
    let lastEnd = 0;
    for (const match of proposed.matchAll(displayedWords)) {
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
      currentFragment.append(before.slice(lastEnd, match.index), oldMark);

      const newMark = document.createElement("mark");
      newMark.className = "word-proposed";
      newMark.dataset.direction = direction;
      newMark.dataset.strength = delta === 0 ? "0" : size < 1 ? "1" : size < 3 ? "2" : "3";
      const pair = {offset: match.index, before: oldWord, proposed: word, detail, marks: [oldMark, newMark]};
      changedWords.set(pair.offset, pair);
      for (const [mark, side] of [[oldMark, "before"], [newMark, "proposed"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "word-inspect";
        button.dataset.offset = pair.offset;
        button.dataset.side = side;
        button.textContent = pair[side];
        button.title = detail;
        button.setAttribute("aria-label", `Inspect ${side === "before" ? "current" : "proposed"} word ${pair[side]}. ${detail}`);
        button.setAttribute("aria-controls", scoreDetails.id);
        mark.append(button);
      }
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

  function render(proposal = null, sameSwap = false) {
    lastProposal = proposal;
    changedWords.clear();
    pickerWords = null;
    highlightedWord = null;
    if (!sameSwap) selectedOffset = null;
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
    if (scoreDetails.open) updateInspection();
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
    render(proposal, Boolean(replay));
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
    scoreDetails.open = false;
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
    scoreDetails.open = false;
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
    if (!lastProposal) {
      if (scoreDetails.open) updateInspection();
      return;
    }
    halt();
    const {currentKey, swapped, u} = lastProposal;
    chain = createChain(input.value, {key: currentKey, lambda});
    clearLog();
    oneStep({swapped, u});
    syncControls();
    setStatus("Paused · Same swap and draw at the new word weight", "paused");
  }

  function highlightWord(pair) {
    if (highlightedWord === pair) return;
    if (highlightedWord?.marks) {
      for (const mark of highlightedWord.marks) mark.classList.remove("is-inspected");
    }
    highlightedWord = pair;
    if (pair.marks) {
      for (const mark of pair.marks) mark.classList.add("is-inspected");
    }
    wordDetail.textContent = pair.detail;
  }

  function pauseForInspection() {
    if (!running) return;
    halt();
    syncControls();
    setStatus("Paused", "paused");
  }

  function buildWordPicker() {
    pickerWords = new Map();
    const changed = document.createElement("optgroup");
    changed.label = "Changed by the swap";
    const unchanged = document.createElement("optgroup");
    unchanged.label = "Unchanged by the swap";
    // Generate choices only on inspection. The offset identifies the exact
    // occurrence even when a changed word appears more than once.
    for (const match of byId("proposed-text").textContent.matchAll(displayedWords)) {
      const spelling = match[0];
      if (!/[a-z]/i.test(spelling)) continue;
      const offset = match.index;
      const pair = changedWords.get(offset);
      const word = pair || {offset, before: spelling, proposed: spelling, detail: `“${spelling}” is unchanged (Δ 0.000).`};
      word.ordinal = pickerWords.size + 1;
      pickerWords.set(offset, word);
      const label = pair ? `${word.before} → ${word.proposed}` : spelling;
      const option = new Option(`${word.ordinal}. ${label}`, String(offset));
      (pair ? changed : unchanged).append(option);
    }
    wordPicker.replaceChildren();
    if (changed.childElementCount) wordPicker.append(changed);
    if (unchanged.childElementCount) wordPicker.append(unchanged);
  }

  // Only build the detailed tables for the word a student is inspecting.
  // A character offset distinguishes repeated occurrences through a λ replay.
  function updateInspection(side) {
    let word = example;
    wordControl.hidden = !lastProposal;
    if (lastProposal) {
      if (!pickerWords) buildWordPicker();
      word = pickerWords.get(selectedOffset) || changedWords.values().next().value || pickerWords.values().next().value;
      if (!word) {
        panelWord = null;
        wordControl.hidden = true;
        scorePanel.clear("This proposal contains no scored words.");
        return;
      }
      if (selectedOffset !== word.offset) side = "proposed";
      selectedOffset = word.offset;
      wordPicker.value = String(word.offset);
      highlightWord(word);
    }
    if (panelWord === word && panelLambda === lambda && (!side || scorePanel.side === side)) return;
    panelWord = word;
    panelLambda = lambda;
    scorePanel.show({before: word.before, proposed: word.proposed, example: Boolean(word.example),
      ordinal: word.ordinal, noChanges: Boolean(lastProposal) && changedWords.size === 0,
      lambda, iteration: lastProposal?.iteration ?? 0, side});
  }

  function inspectWord(event) {
    const button = event.target.closest(".word-inspect");
    if (!button) return;
    const word = changedWords.get(Number(button.dataset.offset));
    if (!word) return;
    // Keyboard focus pauses before a live update can replace the focused word.
    if (event.type !== "pointerover") pauseForInspection();
    if (event.type !== "click") {
      if (!scoreDetails.open) highlightWord(word);
      return;
    }
    selectedOffset = word.offset;
    scoreDetails.open = true;
    updateInspection(button.dataset.side);
    const summary = scoreDetails.querySelector("summary");
    summary.focus({preventScroll: true});
    summary.scrollIntoView({block: "start"});
  }
  for (const id of ["current-text", "proposed-text"]) {
    const translation = byId(id);
    translation.addEventListener("pointerover", inspectWord);
    translation.addEventListener("focusin", inspectWord);
    translation.addEventListener("click", inspectWord);
  }
  scoreDetails.querySelector("summary").addEventListener("click", () => {
    if (!scoreDetails.open) pauseForInspection();
  });
  scoreDetails.addEventListener("toggle", () => {
    if (!scoreDetails.open) return;
    pauseForInspection();
    updateInspection();
  });
  wordPicker.addEventListener("change", () => {
    selectedOffset = Number(wordPicker.value);
    updateInspection("proposed");
  });
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
  const section = window.location.hash;
  if (section === "#score-inspector" || section === "#pair-matrix-details") {
    scoreDetails.open = true;
    if (section === "#pair-matrix-details") byId("pair-matrix-details").open = true;
  }
})();
