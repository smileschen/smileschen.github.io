import { temper } from "./twister.js?v=output-panel";

const binary = value => value.toString(2).padStart(5, "0");

function node(tag, className, text) {
  const item = document.createElement(tag);
  item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function step(board, title) {
  const block = node("div", "temper-step");
  block.append(node("h3", "temper-heading", title));
  board.append(block);
  return block;
}

function row(step, key, label, value) {
  const row = node("div", "temper-row");
  row.dataset.temperRow = key;
  const word = node("span", "word-bits temper-bits");
  const digits = value == null ? "·····" : binary(value);
  word.setAttribute("role", "img");
  word.setAttribute("aria-label", value == null ? "Awaiting a word" : digits);
  for (const digit of digits) {
    const bit = node("span", "mt-cell", digit);
    bit.classList.toggle("one", digit === "1");
    bit.classList.toggle("temper-empty", value == null);
    bit.setAttribute("aria-hidden", "true");
    word.append(bit);
  }
  const caption = node("span", "temper-label", label);
  if (key === "right" || key === "masked") {
    const symbol = node("span", "temper-xor", "⊕");
    symbol.setAttribute("aria-hidden", "true");
    caption.prepend(symbol);
  }
  row.append(caption, word);
  step.append(row);
  return [...word.children];
}

function appear(item, delay, duration) {
  item.animate([{ opacity: 0 }, { opacity: 1 }], { delay, duration, fill: "backwards" });
}

// A destination bit starts over its source bit. Zero-fill and masked-out
// columns appear in place so the animation only carries bits that survive.
function shiftBits(source, destination, offset, delay, mask = 0b11111) {
  destination.forEach((cell, index) => {
    const from = source[index - offset];
    if (!from || !(mask & (16 >> index))) {
      appear(cell, delay + 220, 190);
      return;
    }
    // offsetLeft/Top are layout coordinates, independent of prior animations.
    const dx = from.offsetLeft - cell.offsetLeft;
    const dy = from.offsetTop - cell.offsetTop;
    cell.animate([
      { opacity: 0, transform: `translate(${dx}px, ${dy}px)` },
      { opacity: 1, transform: `translate(${dx}px, ${dy}px)`, offset: .15 },
      { opacity: 1, transform: "none" },
    ], { delay, duration: 420, fill: "backwards", easing: "ease-in-out" });
  });
}

function showXor(first, operand, result, start) {
  result.forEach((cell, index) => {
    const delay = start + index * 35;
    const outline = [{ outline: "2px solid #70aa98" }, { outline: "2px solid transparent" }];
    for (const source of [first[index], operand[index]]) {
      source.animate(outline, { delay, duration: 250 });
    }
    cell.animate([{ transform: "rotateX(-65deg)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { delay, duration: 210, fill: "backwards", easing: "ease-out" });
  });
}

export function renderTempering(container, entry, animate = false) {
  const values = entry ? temper(entry.value) : {};
  const board = node("div", "temper-board");
  const firstStep = step(board, "Right shift and XOR");
  const copy = row(firstStep, "copy", entry ? `Copy of word ${entry.number}` : "Copy of stored word", entry?.value);
  const right = row(firstStep, "right", "Shift right by 2", values.right);
  const first = row(firstStep, "first", "First XOR", values.first);
  firstStep.append(node("p", "temper-note", "Compare the two rows above. XOR gives 1 wherever their bits differ."));

  const secondStep = step(board, "Masked left shift and XOR");
  const intermediate = row(secondStep, "intermediate", "First XOR", values.first);
  const masked = row(secondStep, "masked", "Shift left by 1, then mask", values.masked);
  const output = row(secondStep, "output", "Final XOR", values.output);
  const maskNote = entry
    ? `Shifting left gives ${binary(values.left)}. Keeping only the bits under the 1s in mask ${binary(values.mask)} gives ${binary(values.masked)}.`
    : "After shifting left, keep the bits under the 1s in mask 10110.";
  secondStep.append(node("p", "temper-note", maskNote));

  const decimal = node("div", "temper-decimal");
  const result = node("strong", "", entry ? values.output : "—");
  result.id = "output-decimal";
  decimal.append(node("span", "", "Output in decimal"), result);
  container.dataset.word = entry?.number ?? "";
  container.replaceChildren(board, decimal);
  if (!entry || !animate || typeof board.animate !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  copy.forEach(cell => appear(cell, 0, 160));
  shiftBits(copy, right, 2, 150);
  showXor(copy, right, first, 580);
  intermediate.forEach(cell => appear(cell, 900, 140));
  shiftBits(intermediate, masked, -1, 1050, values.mask);
  showXor(intermediate, masked, output, 1490);
  appear(result, 1820, 150);
}
