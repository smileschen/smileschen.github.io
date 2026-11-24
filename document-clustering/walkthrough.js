(() => {
  const { documents, vocabulary, initialAssignments } = corpusData;
  const {
    initialize, randomAssignments, update,
  } = gibbsSampler;
  const get = id => document.getElementById(id);
  const snapshotNames = ["before", "excluded", "after"];
  const stageNames = ["remove", "score", "sample", "restore"];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stageTitles = { before: "Before removal", remove: "Remove", score: "Score", sample: "Draw", restore: "Restore" };
  const stageSnapshots = { before: "before", remove: "excluded", score: "excluded", sample: "excluded", restore: "after" };

  let sampler;
  let last = null;
  let stage = null;
  let animationTimer = null;
  let awaitingPrediction = false;
  let prediction = null;
  let stemmed = false;
  let finishMessage = "";
  const documentCards = [];
  const progressSegments = [];

  function element(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }

  function documentName(index) {
    return `Document ${String(documents[index].id).padStart(2, "0")}`;
  }

  function clusterName(cluster) {
    return `Cluster ${cluster + 1}`;
  }

  function clusterBadge(cluster, label = clusterName(cluster)) {
    const badge = element("span", `cluster-badge ${cluster === null ? "held" : `c${cluster + 1}`}`);
    badge.append(element("span", "cluster-dot"), document.createTextNode(label));
    badge.firstChild.setAttribute("aria-hidden", "true");
    return badge;
  }

  function fixed(value, digits = 4) {
    return (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toFixed(digits).replace("-", "−");
  }

  function probability(value, other) {
    const percent = value * 100;
    if (percent > 0 && percent < 0.0001) return `${percent.toExponential(3)}%`;
    if (other > 0 && percent > 99.9999) return ">99.9999%";
    return `${fixed(percent)}%`;
  }

  function createCorpus() {
    for (const [index, entry] of documents.entries()) {
      const item = element("li", "document-card");
      const header = element("div", "document-card-header");
      const title = element("div", "document-meta");
      const name = element("strong", "document-name", documentName(index));
      const source = element("span", "document-source", `${entry.book} · Passage ${entry.bookLine}`);
      title.append(name, source);
      const label = element("span", "document-assignment");
      header.append(title, label);
      const body = element("p", "document-text");
      item.append(header, body);
      get("documents").append(item);
      documentCards.push({ item, label, body });
    }
    renderDocumentText();
  }

  function renderDocumentText() {
    get("original").setAttribute("aria-pressed", String(!stemmed));
    get("stemmed").setAttribute("aria-pressed", String(stemmed));
    const note = stemmed
      ? "Stems are lowercased. Punctuation, numbers, stop words, and stems shorter than three characters are removed."
      : "Sources are shown for reference. The sampler uses word counts alone.";
    get("corpus-note").textContent = note;
    documentCards.forEach(({ body }, index) => {
      const entry = documents[index];
      const parts = stemmed
        ? entry.tokens.flatMap((token, position) => position === 0 ? [[token, true]] : [[" ", false], [token, true]])
        : entry.originalParts;
      const fragment = document.createDocumentFragment();
      let tokenIndex = 0;
      for (const [text, retained] of parts) {
        if (retained) {
          const mark = element("mark", "", text);
          mark.dataset.stem = entry.tokens[tokenIndex++];
          fragment.append(mark);
        } else {
          fragment.append(document.createTextNode(text));
        }
      }
      body.replaceChildren(fragment);
    });
  }

  function selectedSnapshot() {
    return stageSnapshots[stage] || "after";
  }

  function visibleAssignment(index) {
    if (last && index === last.index) {
      const snapshot = selectedSnapshot();
      if (snapshot === "before") return last.previousCluster;
      if (snapshot === "excluded") return null;
    }
    return sampler.assignments[index];
  }

  function renderCorpus() {
    const visibleClusters = last ? last[selectedSnapshot()] : sampler.clusters;
    get("cluster-summary").replaceChildren(...visibleClusters.map((cluster, index) =>
      clusterBadge(index, `${clusterName(index)} · ${cluster.documents} docs`)));

    documentCards.forEach(({ item, label }, index) => {
      const active = last?.index === index;
      item.classList.toggle("is-current", active);
      item.classList.toggle("is-egg-lesson", active && last.sweep === 1 && index === 0);
      if (active) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
      const cluster = visibleAssignment(index);
      label.replaceChildren(cluster === null ? clusterBadge(null, "Held out") : clusterBadge(cluster));
    });
  }

  function revealDocument(index) {
    const region = get("corpus-scroll");
    const card = documentCards[index].item;
    const distance = card.getBoundingClientRect().top - region.getBoundingClientRect().top;
    region.scrollTop += distance - 8;
  }

  function isLessonEgg(column) {
    return last?.sweep === 1 && last.index === 0 && vocabulary[column] === "egg";
  }

  function matrixRow(title, counts, columns, options = {}) {
    const row = element("tr", options.className || "matrix-row");
    const label = element("th", "matrix-row-label", title);
    label.scope = "row";
    row.append(label);
    const addCell = (value, active = false, delta = 0, column) => {
      const cell = element("td", "matrix-cell", value);
      cell.classList.toggle("is-zero", value === 0);
      if (options.illustrateEgg && isLessonEgg(column)) cell.classList.add("egg-column");
      cell.classList.toggle("is-current-term", active);
      cell.classList.toggle("is-removed", delta < 0);
      cell.classList.toggle("is-added", delta > 0);
      if (delta) cell.title = `${delta > 0 ? "+" : "−"}${Math.abs(delta)} in this stage`;
      row.append(cell);
    };
    addCell(counts.reduce((total, count) => total + count, 0), false, options.deltaTokens);
    columns.forEach(column => {
      addCell(counts[column], options.activeCounts?.[column] > 0, options.deltaCounts?.[column], column);
    });
    return row;
  }

  function matrixGroup(cluster, counts, columns, currentIndex, activeCounts) {
    const group = element("tbody", `matrix-group c${cluster + 1}`);
    const name = clusterName(cluster);
    const count = counts.documents;
    const totalLabel = `${name} total · ${count} ${count === 1 ? "doc" : "docs"}`;
    const compare = last && { excluded: last.before, after: last.excluded }[selectedSnapshot()];
    const previous = compare && compare[cluster];
    const deltaCounts = previous && counts.counts.map((value, i) => value - previous.counts[i]);
    group.append(matrixRow(totalLabel, counts.counts, columns, {
      className: `matrix-total c${cluster + 1}`,
      illustrateEgg: true,
      activeCounts,
      deltaCounts,
      deltaTokens: previous ? counts.tokens - previous.tokens : 0,
    }));

    for (const [index, entry] of documents.entries()) {
      if (visibleAssignment(index) === cluster) {
        const active = index === currentIndex && last !== null;
        group.append(matrixRow(documentName(index), entry.counts, columns, {
          className: active ? "matrix-row is-current" : "matrix-row",
          activeCounts,
        }));
      }
    }
    return group;
  }

  function renderMatrix() {
    const snapshot = selectedSnapshot();
    const currentIndex = last?.index ?? sampler.nextIndex;
    const currentCounts = documents[currentIndex].counts;
    const isFiltered = get("word-filter").checked;
    const columns = vocabulary.map((_, index) => index).filter(index => !isFiltered || currentCounts[index] > 0);
    const counts = last ? last[snapshot] : sampler.clusters;
    const caption = !last ? "Starting assignments. The first document is shown in the reference row."
      : {
          before: `${documentName(currentIndex)} still belongs to ${clusterName(last.previousCluster)}.`,
          excluded: `${documentName(currentIndex)} is held out. The two clusters contain ${documents.length - 1} documents combined.`,
          after: `${documentName(currentIndex)} is included in ${clusterName(last.newCluster)}. All ${documents.length} documents are assigned.`,
        }[snapshot];
    const totals = counts.map((cluster, index) => `C${index + 1} has ${cluster.tokens} tokens`).join(" · ");
    get("matrix-caption").textContent = `${caption} ${totals}.`;
    for (const name of snapshotNames) {
      get(name).disabled = !last;
      get(name).setAttribute("aria-pressed", String(name === snapshot));
    }

    const header = document.createElement("thead");
    const headings = document.createElement("tr");
    for (const [index, name] of ["Document", "Tokens", ...columns.map(column => vocabulary[column])].entries()) {
      const th = element("th", index === 0 ? "matrix-row-label" : "", name);
      th.scope = "col";
      if (index > 1 && currentCounts[columns[index - 2]] > 0) th.classList.add("is-current-term");
      if (index > 1 && isLessonEgg(columns[index - 2])) th.classList.add("egg-column");
      headings.append(th);
    }
    header.append(headings);
    const groups = counts.map((cluster, index) => matrixGroup(index, cluster, columns, currentIndex, currentCounts));
    const reference = element("tfoot", "matrix-group held");
    reference.append(matrixRow(`${last ? "Current" : "Next"} · ${documentName(currentIndex)}`, currentCounts, columns, {
      className: "matrix-row is-current",
      illustrateEgg: true,
      activeCounts: currentCounts,
    }));
    const table = get("matrix");
    table.replaceChildren(table.caption, header, ...groups, reference);
  }

  function renderProgress() {
    const sweep = last?.sweep ?? sampler.sweep;
    const restored = stage === "restore";
    const processed = last ? last.index + Number(restored) : 0;
    const completed = processed === documents.length ? sweep : sweep - 1;
    const nextName = documentName(sampler.nextIndex);
    get("sweep-tag").textContent = `Sweep ${sweep}${processed === documents.length ? " complete" : ""}`;
    get("next-document").textContent = last && !restored
      ? `${documentName(last.index)} · ${stageTitles[stage]}`
      : `Next · ${nextName}${processed === documents.length ? ` · Sweep ${sampler.sweep}` : ""}`;
    get("sweep-progress").textContent = `${processed} of ${documents.length} updated`;
    get("completed-sweeps").textContent = `${completed} ${completed === 1 ? "sweep" : "sweeps"} complete`;
    progressSegments.forEach((segment, index) => {
      segment.classList.toggle("is-done", index < processed);
      segment.classList.toggle("is-next", index === processed);
    });
    const primary = get("step");
    primary.textContent = awaitingPrediction
      ? (stage === "sample" ? "Reveal assignment" : "Show draw")
      : "Step one document";
    primary.title = awaitingPrediction ? primary.textContent : `Update ${nextName} in sweep ${sampler.sweep}`;
  }

  function scoreRow(label, values, className = "") {
    const row = element("tr", className);
    const key = element("th", "", label);
    key.scope = "row";
    row.append(key, ...values.map(value => element("td", "", value)));
    return row;
  }

  function scoreTable() {
    const table = element("table", "score-table");
    const header = document.createElement("thead");
    const names = document.createElement("tr");
    const first = element("th", "", "Log calculation");
    first.scope = "col";
    names.append(first);
    for (const index of [0, 1]) {
      const column = document.createElement("th");
      column.scope = "col";
      column.append(clusterBadge(index));
      names.append(column);
    }
    header.append(names);
    const logs = field => last.scores.map(score => fixed(score[field]));
    const body = document.createElement("tbody");
    body.append(
      scoreRow("Cluster size", logs("logSize")),
      scoreRow("+ Word prediction", logs("logWords")),
      scoreRow("= Log score", logs("logWeight"), "score-total"),
      scoreRow("Shifted weight", last.scores.map(score => score.shiftedWeight.toPrecision(6))),
      scoreRow("Cluster probability", last.scores.map((score, index) => probability(score.probability, last.scores[1 - index].probability)), "score-probability"),
    );
    table.append(header, body);
    return table;
  }

  function formulaDetails(open) {
    const details = element("details", "formula-details");
    details.open = open;
    details.append(element("summary", "", "Expand the log calculation"));
    last.scores.forEach((score, index) => {
      const cluster = last.excluded[index];
      const currentTokens = last.before[last.previousCluster].tokens - last.excluded[last.previousCluster].tokens;
      const start = cluster.tokens + vocabulary.length;
      const end = start + currentTokens - 1;
      const group = element("div", "formula-group");
      const size = `ln(${cluster.documents} + 1) − ln(${documents.length - 1} + 2) = ${fixed(score.logSize)}`;
      const denominatorSum = currentTokens === 0 ? "0" : currentTokens === 1 ? `ln(${start})`
        : currentTokens === 2 ? `ln(${start}) + ln(${end})` : `ln(${start}) + … + ln(${end})`;
      group.append(
        element("h3", "", clusterName(index)),
        element("p", "formula-line", `Size term = ${size}`),
        element("p", "formula-line", `Word denominator = ${denominatorSum} = ${fixed(score.logDenominator)}`),
      );
      const table = element("table", "term-table");
      const header = document.createElement("thead");
      const heading = document.createElement("tr");
      for (const name of ["Stem", "Copies", "Numerator terms", "Log sum"]) {
        const th = element("th", "", name);
        th.scope = "col";
        heading.append(th);
      }
      header.append(heading);
      const body = document.createElement("tbody");
      for (const term of score.wordTerms) {
        const factors = Array.from({ length: term.count }, (_, offset) => `ln(${term.base + offset})`).join(" + ");
        body.append(scoreRow(vocabulary[term.column], [term.count, factors, fixed(term.logTerm)]));
      }
      table.append(header, body);
      group.append(table, element("p", "formula-line",
        `Word prediction = ${fixed(score.logNumerator)} − ${fixed(score.logDenominator)} = ${fixed(score.logWords)}`));
      details.append(group);
    });
    return details;
  }

  function thresholdLabel() {
    const [first, second] = last.scores;
    if (first.probability > 0.999999 && second.probability > 0) {
      return `1 − ${Number(second.probability.toPrecision(6))}`;
    }
    return String(Number(first.probability.toPrecision(7)));
  }

  function probabilityScale(showDraw) {
    const scale = element("div", "probability-scale");
    scale.setAttribute("aria-hidden", "true");
    last.scores.forEach((score, index) => {
      const segment = element("span", `cluster-segment c${index + 1}`);
      segment.style.width = `${score.probability * 100}%`;
      scale.append(segment);
    });
    if (showDraw) {
      const marker = element("span", "draw-marker");
      marker.style.left = `${last.draw * 100}%`;
      scale.append(marker);
    }
    const labels = element("div", "probability-labels");
    labels.setAttribute("aria-hidden", "true");
    labels.append(element("span", "", "0"), element("span", "", "1"));

    const scaleGroup = element("div", "draw-scale");
    scaleGroup.append(element("p", "draw-description", `In a random run, U is a uniform draw from 0 to 1. Cluster 1’s interval ends at p₁ ≈ ${thresholdLabel()}.`));
    const intervals = element("div", "draw-intervals");
    ["0 ≤ U ≤ p₁", "p₁ < U ≤ 1"].forEach((range, k) => {
      const label = element("span", `interval-label c${k + 1}`);
      label.append(clusterBadge(k), document.createTextNode(` ${range}`));
      intervals.append(label);
    });
    scaleGroup.append(scale, labels, intervals);
    if (showDraw) {
      // Keep close calls distinguishable when rounding the displayed draw.
      const threshold = last.scores[0].probability;
      const rounded = Number(last.draw.toPrecision(6));
      const showExact = Math.abs(last.draw - threshold) < 0.000001 || rounded === last.draw;
      const display = showExact ? `= ${last.draw}` : `≈ ${rounded}`;
      const drawDescription = element("p", "draw-description", `Draw U ${display}`);
      drawDescription.title = `U = ${last.draw}`;
      scaleGroup.append(drawDescription);
    }
    return scaleGroup;
  }

  function predictionControls() {
    const controls = element("div", "prediction-controls");
    controls.append(element("strong", "", "Which interval contains this draw?"));
    const choices = element("div", "prediction-choices");
    for (const k of [0, 1]) {
      const button = element("button", "button secondary", `Predict ${clusterName(k)}`);
      button.type = "button";
      button.addEventListener("click", () => {
        prediction = k;
        selectStage("restore");
        get("update-details").querySelector(".decision").focus({ preventScroll: true });
      });
      choices.append(button);
    }
    const reveal = element("button", "button subtle", "Show answer");
    reveal.type = "button";
    reveal.addEventListener("click", () => {
      selectStage("restore");
      get("update-details").querySelector(".decision").focus({ preventScroll: true });
    });
    choices.append(reveal);
    controls.append(choices);
    return controls;
  }

  function drawExample() {
    const example = element("details", "draw-example");
    example.append(element("summary", "", "Try a different U for Document 07"));
    example.append(element("p", "", "Keep these two probabilities and test where a different draw would fall. The recorded assignment is shown above."));
    const choices = element("div", "prediction-choices");
    const result = element("p", "prediction-feedback");
    result.setAttribute("aria-live", "polite");
    for (const u of [0.02, 0.60]) {
      const button = element("button", "button secondary", `Test U = ${u.toFixed(2)}`);
      button.type = "button";
      button.addEventListener("click", () => {
        const k = u <= last.scores[0].probability ? 0 : 1;
        result.textContent = `U = ${u.toFixed(2)} falls in the ${clusterName(k)} interval and would select ${clusterName(k)}.`;
      });
      choices.append(button);
    }
    example.append(choices, result);
    return example;
  }

  function renderUpdate() {
    const subtitle = get("update-subtitle");
    const container = get("update-details");
    const position = stageNames.indexOf(stage);
    for (const [index, item] of [...get("stages").children].entries()) {
      const active = index === position;
      const button = item.querySelector("button");
      button.disabled = !last;
      button.setAttribute("aria-pressed", String(active));
      item.classList.toggle("is-done", index < position || stage === "restore");
      item.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    }
    if (!last) {
      subtitle.textContent = "Start with Document 01.";
      const intro = element("p", "empty-update", "Read the first passage, then select Step one document. Select a stage to inspect its passage, counts, and calculation together.");
      container.replaceChildren(intro);
      return;
    }

    const name = documentName(last.index);
    subtitle.textContent = `Sweep ${last.sweep} · ${name} · ${stageTitles[stage]}`;
    const detailsOpen = container.querySelector(".formula-details")?.open ?? false;
    const removed = documents[last.index].tokens.length;
    const message = stage === "before"
      ? `${name} contributes ${removed} tokens to ${clusterName(last.previousCluster)}. Select Remove to set them aside.`
      : `Held out ${removed} tokens from ${clusterName(last.previousCluster)}. Using only the other ${documents.length - 1} documents keeps this passage from predicting itself.`;
    container.replaceChildren(element("p", "step-message", message));
    const lesson = renderWordLesson({ transaction: last, stage, documents, vocabulary });
    if (lesson) container.append(lesson);
    if (stage === "before" || stage === "remove") return;

    const weights = element("p", "normalization", `Subtract the largest log score (${fixed(last.maxLogWeight)}), exponentiate, then divide by the sum of the shifted weights (${last.weightTotal.toPrecision(6)}).`);
    container.append(scoreTable(), weights, probabilityScale(stage !== "score"));

    if (stage === "sample") container.append(predictionControls());
    if (stage === "restore") {
      const decision = element("div", `decision c${last.newCluster + 1}`);
      decision.tabIndex = -1;
      const title = last.newCluster === last.previousCluster
        ? `${name} stays in ${clusterName(last.newCluster)}`
        : `${name} moves to ${clusterName(last.newCluster)}`;
      if (prediction !== null) {
        const feedback = prediction === last.newCluster ? "Your prediction matches the draw." : `You predicted ${clusterName(prediction)}.`;
        decision.append(element("p", "prediction-feedback", feedback));
      }
      const rule = last.newCluster === 0 ? "at or below" : "above";
      const explanation = `U falls ${rule} p₁, selecting ${clusterName(last.newCluster)}. Its ${removed} tokens are now included in that cluster’s totals.`;
      decision.append(element("strong", "", title), element("p", "", explanation));
      container.append(decision);
      if (last.index === 6) container.append(drawExample());
      if (finishMessage) container.append(element("p", "step-message finish-message", finishMessage));
    }
    container.append(formulaDetails(detailsOpen));
  }

  function render() {
    renderCorpus();
    renderMatrix();
    renderProgress();
    renderSweepHistory(get("sweep-history"), sampler, last, stage);
    renderUpdate();
  }

  function stopAnimation() {
    clearTimeout(animationTimer);
    animationTimer = null;
  }

  function reset(randomize = false) {
    stopAnimation();
    const assignments = randomize ? randomAssignments(documents.length) : initialAssignments.map(label => label - 1);
    sampler = initialize(assignments, documents, vocabulary.length);
    last = null;
    stage = null;
    finishMessage = "";
    awaitingPrediction = false;
    prediction = null;
    get("corpus-scroll").scrollTop = 0;
    get("matrix-scroll").scrollTop = 0;
    get("matrix-scroll").scrollLeft = 0;
    render();
    get("announcement").textContent = randomize ? "Randomized starting labels. Ready for sweep 1." : "Alternating starting labels. Ready for sweep 1.";
  }

  function drawFunction() {
    return get("fixed-draw").checked ? () => 0.60 : Math.random;
  }

  function selectStage(nextStage) {
    stopAnimation();
    stage = nextStage;
    if (stage === "restore") awaitingPrediction = false;
    if (stage === "sample") prediction = null;
    render();
    const name = documentName(last.index);
    const action = stage === "restore" ? `${name} is assigned to ${clusterName(last.newCluster)}.`
      : `${name} · ${stageTitles[stage]}.`;
    get("announcement").textContent = `${finishMessage && stage === "restore" ? `${finishMessage} ` : ""}${action}`;
  }

  function playUpdate() {
    const pauses = get("predict-draw").checked;
    awaitingPrediction = pauses;
    if (motion.matches) {
      selectStage(pauses ? "sample" : "restore");
      return;
    }
    const phases = pauses ? ["remove", "score", "sample"] : stageNames;
    function playPhase(index) {
      selectStage(phases[index]);
      if (index + 1 < phases.length) {
        animationTimer = setTimeout(() => playPhase(index + 1), index === 0 ? 420 : 350);
      }
    }
    playPhase(0);
  }

  function step() {
    stopAnimation();
    if (awaitingPrediction) {
      selectStage(stage === "sample" ? "restore" : "sample");
      return;
    }
    last = update(sampler, drawFunction());
    finishMessage = "";
    prediction = null;
    playUpdate();
    revealDocument(last.index);
  }

  function finishSweep() {
    stopAnimation();
    if (last && stage !== "restore" && last.index === documents.length - 1) {
      selectStage("restore");
      return;
    }
    const sweep = sampler.sweep;
    const remaining = documents.length - sampler.nextIndex;
    const random = drawFunction();
    for (let index = 0; index < remaining; index++) last = update(sampler, random);
    prediction = null;
    finishMessage = `Finished sweep ${sweep}. This calculation shows its final document.`;
    selectStage("restore");
    revealDocument(last.index);
  }

  function setTextMode(showStems) {
    stemmed = showStems;
    renderDocumentText();
    if (last) revealDocument(last.index);
  }

  createCorpus();
  for (let index = 0; index < documents.length; index++) {
    const segment = document.createElement("span");
    get("sweep-track").append(segment);
    progressSegments.push(segment);
  }
  get("step").addEventListener("click", step);
  get("finish").addEventListener("click", finishSweep);
  get("randomize").addEventListener("click", () => reset(true));
  get("reset").addEventListener("click", () => reset());
  get("original").addEventListener("click", () => setTextMode(false));
  get("stemmed").addEventListener("click", () => setTextMode(true));
  for (const item of get("stages").children) {
    item.querySelector("button").addEventListener("click", () => selectStage(item.dataset.stage));
  }
  const snapshotStages = { before: "before", excluded: "score", after: "restore" };
  for (const name of snapshotNames) {
    get(name).addEventListener("click", () => selectStage(snapshotStages[name]));
  }
  get("predict-draw").addEventListener("change", () => {
    if (!last) return;
    awaitingPrediction = get("predict-draw").checked;
    selectStage(awaitingPrediction ? "sample" : "restore");
  });
  get("word-filter").addEventListener("change", () => {
    get("matrix-scroll").scrollLeft = 0;
    renderMatrix();
  });
  reset();
  get("activity").hidden = false;
})();
