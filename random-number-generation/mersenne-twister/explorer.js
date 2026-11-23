import { INITIAL_WORDS, computeUpdate, applyUpdate, temper } from "./twister.js?v=output-panel";
import { renderWorkbench } from "./workbench.js?v=slower-twist";
import { renderTempering } from "./output.js?v=tempering";

const byId = id => document.getElementById(id);
const binary = value => value.toString(2).padStart(5, "0");
const slotName = index => "ABCDEFG"[index % 7];
const beat = 2100;
const workbench = byId("workbench");
const memory = byId("memory");
const outputContent = byId("output-content");
const historyList = byId("output-history");
const counts = Array(32).fill(0);
const history = [];
let displayedEntry;

// Keep the pre-update snapshot until the next word starts so each step can be undone.
let words = [...INITIAL_WORDS];
let head = 0;
let wordNumber = 1;
let stage = 0;
let originalWords = null;
let playback = null;
let timer;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bitStrip(value, changed = 0) {
  const strip = element("span", "word-bits");
  strip.setAttribute("role", "img");
  strip.setAttribute("aria-label", binary(value));
  for (const [index, digit] of [...binary(value)].entries()) {
    const cell = element("span", digit === "1" ? "mt-cell one" : "mt-cell", digit);
    if (changed & (16 >> index)) cell.classList.add("changed");
    cell.setAttribute("aria-hidden", "true");
    strip.append(cell);
  }
  return strip;
}

function drawMemory(update, animate) {
  const complete = stage === 4;
  const visible = complete ? applyUpdate(words, head) : { words, head };
  const neighbor = (visible.head + 1) % 7;
  const offset = (visible.head + 3) % 7;
  const roles = new Map([[visible.head, "Oldest"], [neighbor, "Neighbor"], [offset, "Offset"]]);
  if (complete) roles.set(head, "Just written");
  memory.replaceChildren();
  visible.words.forEach((value, index) => {
    const row = element("div", "memory-row");
    row.dataset.slot = index;
    row.dataset.value = value;
    row.setAttribute("role", "listitem");
    if (index === visible.head) row.setAttribute("aria-current", "true");
    const written = complete && index === head;
    if (written) row.classList.add("written");
    row.dataset.active = stage <= 1 && (index === head || index === neighbor);
    row.append(element("span", "slot-name", slotName(index)), bitStrip(value),
      element("span", "role-label", roles.get(index) || ""));
    memory.append(row);
    if (written && animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      row.animate([{ backgroundColor: "#f4d0b6" }, { backgroundColor: "#fff4ec" }], { duration: 580 });
    }
  });
  byId("memory-note").textContent = complete
    ? `${slotName(head)} now holds ${binary(update.newWord)}. ${slotName(visible.head)} is the oldest slot for the next update.`
    : `Read ${slotName(head)}, ${slotName(neighbor)} and ${slotName(offset)}. Only slot ${slotName(head)} will be overwritten.`;
}

function describeStage(update) {
  const oldest = slotName(head);
  const next = slotName(head + 1);
  const offset = slotName(head + 3);
  const stages = [
    ["Read the source words", `Start with ${oldest} and its neighbor ${next}. At the last step, you’ll also use ${offset}, three slots ahead of ${oldest}.`],
    ["Join the bits", `Take the leftmost bit from ${oldest} and the four rightmost bits from ${next} to make one five-bit word.`],
    ["Shift one place right", "Save the rightmost bit as it leaves the word. A zero enters the empty position on the left."],
    update.dropped
      ? ["Apply the twist mask", `The saved bit is 1. XOR with the twist mask ${binary(update.mask)} flips bits 4, 2 and 0.`]
      : ["Skip the twist mask", `The saved bit is 0, so skip the twist mask ${binary(update.mask)} and copy the shifted word.`],
    ["Write the new word", `XOR with ${offset}, store ${binary(update.newWord)} in ${oldest}, then move the pointer to ${next}. XOR gives 1 wherever the two input bits differ.`],
  ];
  const [title, instruction] = stages[stage];
  byId("word-number").textContent = wordNumber;
  byId("stage-title").textContent = title;
  byId("stage-instruction").textContent = instruction;
  [...byId("step-track").children].forEach((step, index) => {
    step.classList.toggle("done", index + 1 < stage);
    if (index + 1 === stage) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
}

function resultRow(label, value, changed = 0) {
  const row = element("div", "result-row");
  row.dataset.value = value;
  row.append(element("span", "result-label", label), bitStrip(value, changed));
  return row;
}

function drawExperiment(update) {
  const neighbor = slotName(head + 1);
  const original = originalWords ? computeUpdate(originalWords, head) : update;
  byId("flip-question").textContent = originalWords
    ? `You changed ${neighbor}’s rightmost bit from ${original.dropped} to ${update.dropped}. Watch what happens when that bit reaches the mask.`
    : `Predict which squares will change in the new word if you flip ${neighbor}’s rightmost bit from ${update.dropped} to ${1 - update.dropped}.`;
  byId("flip").textContent = originalWords ? "Replay changed bit" : "Flip bit and replay";
  byId("restore").hidden = !originalWords;
  const result = byId("comparison-result");
  result.hidden = !originalWords || stage !== 4;
  result.replaceChildren();
  if (!result.hidden) {
    result.append(resultRow("Original stored word", original.newWord),
      resultRow("With one bit flipped", update.newWord, original.newWord ^ update.newWord),
      element("p", "result-note", `Both runs shift to ${binary(update.shifted)}. The mask changes the stored word at positions 4, 2 and 0, underlined above.`));
  }
}

const bins = counts.map((count, output) => {
  const cell = element("li", "tally-cell");
  cell.dataset.output = output;
  const value = element("span", "tally-number", output);
  const frequency = element("span", "tally-count", `×${count}`);
  value.setAttribute("aria-hidden", "true");
  frequency.setAttribute("aria-hidden", "true");
  cell.append(value, frequency);
  byId("output-counts").append(cell);
  return cell;
});

function updateTally(latest) {
  bins.forEach((cell, output) => {
    const n = counts[output];
    cell.dataset.count = n;
    cell.classList.toggle("latest", latest?.output === output);
    cell.classList.toggle("seen", n > 0);
    cell.lastElementChild.textContent = `×${n}`;
    cell.setAttribute("aria-label", `Output ${output}, ${n} ${n === 1 ? "occurrence" : "occurrences"}`);
  });
  byId("output-total").textContent = history.length;
  byId("history-empty").hidden = history.length > 0;
}

function drawOutput(update, animate) {
  // A write is provisional until the next word starts. Undoing it also
  // retracts that draw, so replaying and branching never double-count it.
  const completed = stage === 4 ? wordNumber : wordNumber - 1;
  if (completed > history.length) {
    const value = update.newWord;
    const { output } = temper(value);
    history.push({ number: wordNumber, value, output });
    counts[output]++;
    const following = historyList.scrollWidth - historyList.clientWidth - historyList.scrollLeft < 3;
    const item = element("li", "", output);
    item.title = `Word ${wordNumber} · ${output}`;
    historyList.append(item);
    if (following) historyList.scrollLeft = historyList.scrollWidth;
  } else if (completed < history.length) {
    counts[history.pop().output]--;
    historyList.lastElementChild.remove();
  }
  const latest = history.at(-1) ?? null;
  if (latest === displayedEntry) return;

  displayedEntry = latest;
  const wordLabel = latest
    ? `Word ${latest.number} · slot ${slotName(latest.number - 1)}`
    : "Waiting for the first write";
  byId("tempered-word").textContent = wordLabel;
  byId("output-replay").disabled = !latest;
  renderTempering(outputContent, latest, animate && stage === 4);
  updateTally(latest);
}

function drawPlayback() {
  byId("play-text").textContent = playback ? "Pause" : "Play";
  byId("play-shape").setAttribute("d", playback ? "M4 3h3.5v12H4z M10.5 3H14v12h-3.5z" : "M5 3.5 14 9l-9 5.5Z");
}

function render(animate = false, announce = false) {
  const update = computeUpdate(words, head);
  drawMemory(update, animate);
  describeStage(update);
  workbench.dataset.stage = stage;
  renderWorkbench(workbench, { head, stage, update, animate });
  byId("back").disabled = stage === 0;
  drawPlayback();
  drawExperiment(update);
  drawOutput(update, animate);
  if (announce) {
    const outputMessage = stage === 4 ? ` The tempered output is ${displayedEntry.output}.` : "";
    byId("notice").textContent = `Word ${wordNumber}. ${byId("stage-title").textContent}. ${byId("stage-instruction").textContent}${outputMessage}`;
  }
}

function nextWindow() {
  const next = applyUpdate(words, head);
  words = next.words;
  head = next.head;
  wordNumber++;
  stage = 0;
  originalWords = null;
}

function nextOperation() {
  if (stage === 4) nextWindow();
  stage++;
}

function stopPlayback() {
  clearTimeout(timer);
  playback = null;
  drawPlayback();
}

function startPlayback(mode) {
  stopPlayback();
  playback = mode;
  drawPlayback();
  function tick() {
    nextOperation();
    const finished = mode === "single" && stage === 4;
    if (finished) stopPlayback();
    render(true, finished);
    if (!finished) timer = setTimeout(tick, beat);
  }
  timer = setTimeout(tick, beat);
}

byId("operation").addEventListener("click", () => {
  stopPlayback();
  nextOperation();
  render(true, true);
});
function completeWord() {
  stopPlayback();
  if (stage === 4) nextWindow();
  stage = 4;
  render(true, true);
}
byId("word").addEventListener("click", completeWord);
byId("output-next").addEventListener("click", completeWord);
byId("back").addEventListener("click", () => {
  stopPlayback();
  stage = Math.max(0, stage - 1);
  render(false, true);
});
byId("play").addEventListener("click", () => {
  if (playback) stopPlayback();
  else startPlayback(originalWords && stage < 4 ? "single" : "continuous");
});
byId("reset").addEventListener("click", () => {
  stopPlayback();
  words = [...INITIAL_WORDS];
  head = 0;
  stage = 0;
  wordNumber = 1;
  history.length = 0;
  counts.fill(0);
  historyList.replaceChildren();
  originalWords = null;
  render(false, true);
});
byId("flip").addEventListener("click", () => {
  stopPlayback();
  if (!originalWords) {
    originalWords = words;
    words = [...words];
    words[(head + 1) % 7] ^= 1;
  }
  stage = 0;
  render(false, true);
  const frame = workbench.getBoundingClientRect();
  if (frame.bottom < 0 || frame.top >= window.innerHeight) {
    workbench.scrollIntoView({ block: "center", behavior: "instant" });
  }
  startPlayback("single");
});
byId("restore").addEventListener("click", () => {
  stopPlayback();
  words = originalWords;
  originalWords = null;
  stage = 0;
  render(false, true);
  byId("flip").focus({ preventScroll: true });
});
byId("output-replay").addEventListener("click", () => {
  stopPlayback();
  if (displayedEntry) renderTempering(outputContent, displayedEntry, true);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPlayback();
});

render();
