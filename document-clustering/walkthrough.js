(() => {
  const { documents, vocabulary, initialAssignments } = corpusData;
  const {
    initialize, randomAssignments, update,
  } = gibbsSampler;
  const get = id => document.getElementById(id);
  const snapshotNames = ["before", "excluded", "after"];
  const stageNames = ["remove", "score", "sample", "restore"];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  let sampler;
  let last = null;
  let stage = null;
  let busy = false;
  let snapshot = "after";
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

  function probability(value) {
    const percent = value * 100;
    if (percent > 0 && percent < 0.0001) return `${percent.toExponential(3)}%`;
    if (percent < 100 && percent > 99.9999) return ">99.9999%";
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
      for (const [text, retained] of parts) {
        fragment.append(retained ? element("mark", "", text) : document.createTextNode(text));
      }
      body.replaceChildren(fragment);
    });
  }

  function renderCorpus() {
    const visibleClusters = busy ? last.excluded : sampler.clusters;
    get("cluster-summary").replaceChildren(...visibleClusters.map((cluster, index) =>
      clusterBadge(index, `${clusterName(index)} · ${cluster.documents} docs`)));

    documentCards.forEach(({ item, label }, index) => {
      const active = last?.index === index;
      item.classList.toggle("is-current", active);
      if (active) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
      label.replaceChildren(active && busy ? clusterBadge(null, "Held out") : clusterBadge(sampler.assignments[index]));
    });
  }

  function revealDocument(index) {
    const region = get("corpus-scroll");
    const card = documentCards[index].item;
    const distance = card.getBoundingClientRect().top - region.getBoundingClientRect().top;
    region.scrollTop += distance - 8;
  }

  function matrixRow(title, counts, columns, options = {}) {
    const row = element("tr", options.className || "matrix-row");
    const label = element("th", "matrix-row-label", title);
    label.scope = "row";
    row.append(label);
    const addCell = (value, active = false, delta = 0) => {
      const cell = element("td", "matrix-cell", value);
      cell.classList.toggle("is-zero", value === 0);
      cell.classList.toggle("is-current-term", active);
      cell.classList.toggle("is-removed", delta < 0);
      cell.classList.toggle("is-added", delta > 0);
      if (delta) cell.title = `${delta > 0 ? "+" : "−"}${Math.abs(delta)} in this stage`;
      row.append(cell);
    };
    addCell(counts.reduce((total, count) => total + count, 0), false, options.deltaTokens);
    columns.forEach(column => {
      addCell(counts[column], options.activeCounts?.[column] > 0, options.deltaCounts?.[column]);
    });
    return row;
  }

  function matrixGroup(cluster, counts, columns, currentIndex, activeCounts) {
    const group = element("tbody", `matrix-group c${cluster + 1}`);
    const name = clusterName(cluster);
    const count = counts.documents;
    const totalLabel = `${name} total · ${count} ${count === 1 ? "doc" : "docs"}`;
    const compare = last && { excluded: last.before, after: last.excluded }[snapshot];
    const previous = compare && compare[cluster];
    const deltaCounts = previous && counts.counts.map((value, i) => value - previous.counts[i]);
    group.append(matrixRow(totalLabel, counts.counts, columns, {
      className: `matrix-total c${cluster + 1}`,
      activeCounts,
      deltaCounts,
      deltaTokens: previous ? counts.tokens - previous.tokens : 0,
    }));

    for (const [index, entry] of documents.entries()) {
      let assignedCluster = sampler.assignments[index];
      if (index === last?.index) {
        if (snapshot === "excluded") continue;
        if (snapshot === "before") assignedCluster = last.previousCluster;
      }
      if (assignedCluster === cluster) {
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
      get(name).disabled = !last || busy;
      get(name).setAttribute("aria-pressed", String(name === snapshot));
    }

    const header = document.createElement("thead");
    const headings = document.createElement("tr");
    for (const [index, name] of ["Document", "Tokens", ...columns.map(column => vocabulary[column])].entries()) {
      const th = element("th", index === 0 ? "matrix-row-label" : "", name);
      th.scope = "col";
      if (index > 1 && currentCounts[columns[index - 2]] > 0) th.classList.add("is-current-term");
      headings.append(th);
    }
    header.append(headings);
    const groups = counts.map((cluster, index) => matrixGroup(index, cluster, columns, currentIndex, currentCounts));
    const reference = element("tfoot", "matrix-group held");
    reference.append(matrixRow(`${last ? "Current" : "Next"} · ${documentName(currentIndex)}`, currentCounts, columns, {
      className: "matrix-row is-current",
      activeCounts: currentCounts,
    }));
    const table = get("matrix");
    table.replaceChildren(table.caption, header, ...groups, reference);
  }

  function renderProgress() {
    const sweep = busy ? last.sweep : sampler.sweep;
    const completed = busy ? last.sweep - 1 : sampler.completedSweeps;
    const processed = busy ? last.index : sampler.nextIndex;
    get("sweep-tag").textContent = `Sweep ${sweep}`;
    get("next-document").textContent = `${busy ? "Updating" : "Next"} · ${documentName(processed)}`;
    get("sweep-progress").textContent = `${processed} of ${documents.length} updated`;
    get("completed-sweeps").textContent = `${completed} ${completed === 1 ? "sweep" : "sweeps"} complete`;
    progressSegments.forEach((segment, index) => {
      segment.classList.toggle("is-done", index < processed);
      segment.classList.toggle("is-next", index === processed);
    });
    for (const id of ["step", "finish", "randomize", "reset"]) {
      get(id).setAttribute("aria-disabled", String(busy));
    }
    get("lecture-draw").disabled = busy;
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
      scoreRow("Cluster probability", last.scores.map(score => probability(score.probability)), "score-probability"),
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

  function probabilityScale(showDraw) {
    const p1 = last.scores[0].probability;
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
    scaleGroup.append(scale, labels);
    if (showDraw) {
      const relation = last.newCluster === 0 ? "≤" : ">";
      const drawDescription = element("p", "draw-description", `U = ${fixed(last.draw, 6)} ${relation} P(Cluster 1) = ${p1.toPrecision(7)}`);
      drawDescription.title = `U = ${last.draw}, P(Cluster 1) = ${p1}`;
      scaleGroup.prepend(drawDescription);
    }
    return scaleGroup;
  }

  function renderUpdate() {
    const subtitle = get("update-subtitle");
    const container = get("update-details");
    const position = stageNames.indexOf(stage);
    for (const [index, item] of [...get("stages").children].entries()) {
      item.classList.toggle("is-done", index < position || stage === "restore");
      item.classList.toggle("is-active", index === position);
      if (index === position) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }
    if (!last) {
      subtitle.textContent = "Step through Document 01 to see the calculation.";
      const intro = element("div", "empty-update");
      intro.append(element("strong", "", "How one document moves"), element("p", "",
        "Temporarily hold out its word counts. Compare how well the other documents in each cluster predict it, then sample where it goes."));
      container.replaceChildren(intro);
      return;
    }

    const name = documentName(last.index);
    subtitle.textContent = `Sweep ${last.sweep} · ${name}`;
    const existingDetails = container.querySelector(".formula-details");
    const removed = last.before[last.previousCluster].tokens - last.excluded[last.previousCluster].tokens;
    const removal = element("p", "step-message", `Held out ${removed} tokens from ${clusterName(last.previousCluster)}. Both clusters are scored using the other ${documents.length - 1} documents.`);
    container.replaceChildren(removal);
    if (stage === "remove") return;

    const weights = element("p", "normalization", `Subtract the largest log score (${fixed(last.maxLogWeight)}), exponentiate, then divide by the sum of the shifted weights (${last.weightTotal.toPrecision(6)}).`);
    container.append(scoreTable(), weights, probabilityScale(stage !== "score"));

    if (stage === "sample" || stage === "restore") {
      const decision = element("div", `decision c${last.newCluster + 1}`);
      const title = last.newCluster === last.previousCluster
        ? `${name} stays in ${clusterName(last.newCluster)}`
        : `${name} moves to ${clusterName(last.newCluster)}`;
      const explanation = stage === "restore" ? `Added its ${removed} tokens to the sampled cluster.` : "The draw selects the cluster for restoration.";
      decision.append(element("strong", "", title), element("p", "", explanation));
      container.append(decision);
    }
    if (finishMessage) container.append(element("p", "step-message finish-message", finishMessage));
    container.append(formulaDetails(existingDetails?.open ?? false));
  }

  function render() {
    renderCorpus();
    renderMatrix();
    renderProgress();
    renderUpdate();
  }

  function reset(randomize = false) {
    if (busy) return;
    const assignments = randomize ? randomAssignments(documents.length) : initialAssignments.map(label => label - 1);
    sampler = initialize(assignments, documents, vocabulary.length);
    last = null;
    stage = null;
    finishMessage = "";
    snapshot = "after";
    get("corpus-scroll").scrollTop = 0;
    get("matrix-scroll").scrollTop = 0;
    get("matrix-scroll").scrollLeft = 0;
    render();
    get("announcement").textContent = randomize ? "Randomized starting labels. Ready for sweep 1." : "Alternating starting labels. Ready for sweep 1.";
  }

  function drawFunction() {
    return get("lecture-draw").checked ? () => 0.60 : Math.random;
  }

  function finishUpdate() {
    stage = "restore";
    snapshot = "after";
    busy = false;
    render();
    const message = last.previousCluster === last.newCluster ? "stays in" : "moves to";
    get("announcement").textContent = `${finishMessage ? `${finishMessage} ` : ""}${documentName(last.index)} ${message} ${clusterName(last.newCluster)}. ${sampler.completedSweeps} sweeps complete.`;
  }

  async function step() {
    if (busy) return;
    last = update(sampler, drawFunction());
    finishMessage = "";
    if (!motion.matches) {
      busy = true;
      snapshot = "excluded";
      for (const phase of ["remove", "score", "sample"]) {
        stage = phase;
        render();
        if (phase === "remove") revealDocument(last.index);
        await wait(phase === "remove" ? 300 : 220);
      }
    }
    finishUpdate();
    revealDocument(last.index);
  }

  function finishSweep() {
    if (busy) return;
    const sweep = sampler.sweep;
    const remaining = documents.length - sampler.nextIndex;
    const random = drawFunction();
    for (let index = 0; index < remaining; index++) last = update(sampler, random);
    finishMessage = `Finished sweep ${sweep} by running ${remaining} ${remaining === 1 ? "update" : "updates"}. The calculation above shows its last document.`;
    finishUpdate();
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
  for (const name of snapshotNames) {
    get(name).addEventListener("click", () => {
      snapshot = name;
      renderMatrix();
    });
  }
  get("word-filter").addEventListener("change", () => {
    get("matrix-scroll").scrollLeft = 0;
    renderMatrix();
  });
  reset();
  get("activity").hidden = false;
})();
