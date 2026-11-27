(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const { explainWord, alphabet } = window.CipherEngine;
  const scoreFormat = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3, maximumFractionDigits: 3
  });
  const probabilityFormat = new Intl.NumberFormat("en-US", {maximumSignificantDigits: 6});
  const sideNames = {before: "Current", proposed: "Proposed"};
  const formButtons = {};
  let selected;
  let side = "proposed";
  let tokenIndex = 0;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function probability(value) {
    return value < 1e-5 ? Number(value.toPrecision(6)).toExponential() : probabilityFormat.format(value);
  }

  function makeTable(headings, label, className = "") {
    const table = element("table", undefined, ("score-table " + className).trim());
    table.setAttribute("aria-label", label);
    const row = table.createTHead().insertRow();
    for (const heading of headings) {
      const th = element("th", heading);
      th.scope = "col";
      row.append(th);
    }
    table.createTBody();
    return table;
  }

  function addRow(table, label, values) {
    const row = table.tBodies[0].insertRow();
    const th = element("th", label);
    th.scope = "row";
    row.append(th);
    for (const value of values) row.insertCell().textContent = value;
    return row;
  }

  function signed(value) {
    const absolute = Math.abs(value);
    if (absolute < 1e-12) return "0.000";
    return (value > 0 ? "+" : "−") + (absolute < 0.0005 ? absolute.toPrecision(2) : scoreFormat.format(absolute));
  }

  function renderComparison() {
    const {before, proposed, lambda, scores} = selected;
    const table = makeTable(["Contribution", "Current · " + before, "Proposed · " + proposed],
      "Word scores before and after the swap", "score-comparison-table");
    for (const [label, metric, weight] of [
      ["Sum of pair log probabilities", "pairScore", 1],
      ["Sum of word log probabilities", "wordScore", 1],
      [`Weighted word term (λ = ${lambda})`, "wordScore", lambda],
      ["Total (pair sum + weighted word term)", "total", 1]
    ]) {
      const values = [scores.before, scores.proposed].map(s => scoreFormat.format(weight === 0 ? 0 : s[metric] * weight));
      const row = addRow(table, label, values);
      if (metric === "total") row.className = "score-total-row";
    }
    const delta = scores.proposed.total - scores.before.total;
    const change = element("p", `This occurrence contributes ${signed(delta)} log units to the proposal’s score change.`, "score-delta");
    byId("score-comparison").replaceChildren(table, change);
  }

  function renderPairs(token) {
    const container = byId("score-pairs");
    const table = makeTable(["Pair", "P(pair)", "ln P(pair)"],
      "Adjacent pairs in order for " + token.word, "score-pair-table");
    const symbol = i => i === 26 ? "□" : alphabet[i];
    const named = i => i === 26 ? "space" : alphabet[i];
    let shown = 0;
    const more = element("button", "Show more pairs", "button secondary");
    more.type = "button";
    function addPage() {
      const end = Math.min(shown + 40, token.pairs.length);
      for (; shown < end; shown++) {
        const p = token.pairs[shown];
        const pairLabel = symbol(p.from) + " " + symbol(p.to);
        const row = addRow(table, "",
          [probability(p.probability), scoreFormat.format(p.logProbability)]);
        const locate = element("button", pairLabel, "pair-locate");
        locate.type = "button";
        locate.setAttribute("aria-label", `Locate ${named(p.from)} followed by ${named(p.to)} in the matrix`);
        locate.addEventListener("click", () => window.CipherPairMatrix.locate(p.from, p.to));
        row.firstElementChild.append(locate);
      }
      more.hidden = shown === token.pairs.length;
    }
    more.addEventListener("click", addPage);
    addPage();
    const explanation = element("p", "Choose a pair to locate its probability in the matrix. □ marks a word boundary.", "score-footnote");
    const sum = element("p", `Sum of all ${token.pairs.length} pair log probabilities ≈ ${scoreFormat.format(token.pairScore)}.`, "score-footnote");
    container.replaceChildren(explanation, table, more, sum);
    window.CipherPairMatrix.highlight(token.pairs);
  }

  function renderLexicon(token) {
    const {lambda} = selected;
    const table = makeTable(["Word", "P(word)"], "Lexicon probabilities for " + token.word);
    const entries = [
      {word: token.word, probability: token.probability, selected: true}, ...token.neighbors
    ];
    if (token.known) entries.sort((a, b) => b.probability - a.probability);
    for (const entry of entries) {
      const row = addRow(table, entry.word, [probability(entry.probability)]);
      if (entry.selected) {
        row.className = "lex-selected";
        row.firstElementChild.append(element("span", token.known ? " · selected" : " · fallback"));
      }
    }
    const text = token.known
      ? "These four words have the closest log probabilities to the selected word in the lexicon."
      : "This spelling is absent from the lexicon and receives the fallback probability. The other rows show the lowest-frequency recorded entries.";
    const weighted = lambda === 0 ? 0 : lambda * token.logProbability;
    const term = `Word term = ${lambda} × ln(${probability(token.probability)}) ≈ ${scoreFormat.format(weighted)}.`;
    const total = `Score for “${token.word}” ≈ ${scoreFormat.format(token.pairScore)} + (${scoreFormat.format(weighted)}) ≈ ${scoreFormat.format(token.total)}.`;
    byId("score-lexicon").replaceChildren(element("p", text, "score-footnote"), table,
      element("p", term, "score-footnote"), element("p", total, "score-footnote"));
  }

  function renderToken() {
    const tokens = selected.scores[side].tokens;
    const token = tokens[tokenIndex];
    if (token) {
      renderPairs(token);
      renderLexicon(token);
    } else {
      byId("score-pairs").replaceChildren();
      byId("score-lexicon").replaceChildren();
      window.CipherPairMatrix.highlight([]);
    }
  }

  function renderForm() {
    forms.hidden = selected.before === selected.proposed;
    for (const [key, button] of Object.entries(formButtons)) {
      button.textContent = sideNames[key] + " · " + selected[key];
      button.setAttribute("aria-pressed", String(key === side));
    }
    const tokens = selected.scores[side].tokens;
    tokenIndex = Math.max(0, Math.min(tokenIndex, tokens.length - 1));
    const container = byId("score-tokens");
    container.replaceChildren();
    if (tokens.length > 1) {
      const label = element("label", "Inspect token ", "score-token-field");
      const picker = element("select");
      tokens.forEach((token, i) => picker.add(new Option(`${i + 1}. ${token.word}`, i)));
      picker.selectedIndex = tokenIndex;
      picker.addEventListener("change", () => {
        tokenIndex = picker.selectedIndex;
        renderToken();
      });
      label.append(picker);
      container.append(element("p", "The model scores each uninterrupted run of A–Z letters separately and adds their contributions.", "score-footnote"), label);
    }
    renderToken();
  }

  const forms = byId("score-forms");
  forms.classList.add("score-switch");
  forms.setAttribute("role", "group");
  forms.setAttribute("aria-label", "Spelling to inspect");
  for (const key of Object.keys(sideNames)) {
    const button = element("button", sideNames[key]);
    button.type = "button";
    button.addEventListener("click", () => {
      if (side === key) return;
      side = key;
      renderForm();
    });
    forms.append(button);
    formButtons[key] = button;
  }

  function clear(message = "Select a word to inspect its score.") {
    selected = null;
    tokenIndex = 0;
    side = "proposed";
    byId("score-context").textContent = message;
    byId("score-content").hidden = true;
    window.CipherPairMatrix.highlight([]);
  }

  function show({before, proposed, lambda, iteration, example = false, noChanges = false, ordinal, side: requestedSide}) {
    if (!selected || before !== selected.before || proposed !== selected.proposed) tokenIndex = 0;
    if (requestedSide) side = requestedSide === "current" ? "before" : requestedSide;
    const currentScore = explainWord(before, lambda);
    const proposedScore = before === proposed ? currentScore : explainWord(proposed, lambda);
    selected = {before, proposed, lambda, scores: {before: currentScore, proposed: proposedScore}};
    const source = example ? "Worked example" : "Proposal " + iteration.toLocaleString("en-US");
    const occurrence = ordinal ? ` · Word ${ordinal}` : "";
    let description = `“${before}” becomes “${proposed}”.`;
    if (before === proposed) description = `“${before}” is unchanged by this swap.`;
    if (noChanges) description = `This swap leaves every word unchanged. Inspecting “${proposed}”.`;
    byId("score-context").textContent = source + occurrence + " · " + description;
    byId("score-content").hidden = false;
    renderComparison();
    renderForm();
  }

  window.CipherScoreInspector = {show, clear, get side() { return side; }};
})();
