const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const slotName = slot => String.fromCharCode(65 + slot % 7);
const bitsOf = word => word.toString(2).padStart(5, "0");
const transferDuration = 900;
const columnDelay = 50;

function bitCell(digit) {
  const cell = make("span", "wb-bit", digit);
  cell.dataset.value = digit;
  cell.setAttribute("aria-hidden", "true");
  return cell;
}

function heading() {
  const row = make("div", "wb-row wb-columns");
  row.setAttribute("aria-hidden", "true");
  row.append(make("span", "", "Bit position"));
  const columns = make("span", "wb-word");
  for (const index of [4, 3, 2, 1, 0]) columns.append(make("span", "", index));
  row.append(columns);
  return row;
}

function wordRow(sheet, label, detail, word, { result = false, xor = false, slots, mark = [] } = {}) {
  const row = make("div", "wb-row wb-wordrow");
  if (result) row.classList.add("wb-result");
  const name = make("div", "wb-rowname");
  const main = make("span", "wb-name");
  if (xor) {
    const symbol = make("span", "wb-xor", "⊕");
    symbol.setAttribute("aria-label", "XOR");
    main.append(symbol);
  }
  main.append(document.createTextNode(label));
  name.append(main, make("small", "wb-detail", detail));
  const digits = slots ?? bitsOf(word).split("");
  const group = make("div", "wb-word");
  group.setAttribute("role", "img");
  group.setAttribute("aria-label", slots ? `Bits come from words ${slots.join(", ")}` : digits.join(""));
  const cells = digits.map((digit, index) => {
    const cell = bitCell(digit);
    if (slots) cell.classList.add("wb-empty");
    if (mark.includes(index)) cell.classList.add("wb-mark");
    group.append(cell);
    return cell;
  });
  row.append(name, group);
  sheet.append(row);
  return cells;
}

function shiftGuide(sheet) {
  const row = make("div", "wb-row wb-guides");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 500 40");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 4; i++) {
    const x = 50 + i * 100;
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", `M${x + 3},4 L${x + 96},34 M${x + 81},35 L${x + 96},34 L${x + 87},25`);
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(path);
  }
  row.append(make("span", "wb-guide-label", "Shift right"), svg);
  sheet.append(row);
}

function savedBit(sheet, value, stage) {
  const gate = make("div", "wb-gate");
  const cell = bitCell(String(value));
  const copy = make("div", "wb-gate-copy");
  const message = stage === 2 ? "Caught before the shift" : value ? "Twist mask enabled" : "Twist mask skipped";
  copy.append(make("strong", "", `Saved bit · ${value}`), make("small", "", message));
  gate.append(cell, copy);
  sheet.append(gate);
  return cell;
}

function selectedBits(word) {
  return [...bitsOf(word)].flatMap((bit, index) => bit === "1" ? [index] : []);
}

// The moving copy carries its source value until it reaches the destination.
// A changing XOR bit turns over there to reveal the result.
function transfer(sheet, source, destination, delay = 0) {
  const layer = sheet.getBoundingClientRect();
  const from = source.getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  const ghost = bitCell(source.dataset.value);
  ghost.classList.add("wb-ghost");
  Object.assign(ghost.style, {
    left: `${to.left - layer.left}px`, top: `${to.top - layer.top}px`,
    width: `${to.width}px`, height: `${to.height}px`,
  });
  sheet.append(ghost);
  const dx = from.left + from.width / 2 - to.left - to.width / 2;
  const dy = from.top + from.height / 2 - to.top - to.height / 2;
  const travel = `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  const flips = source.dataset.value !== destination.dataset.value;
  const timing = { duration: transferDuration, delay, fill: "backwards" };
  const motion = [{ transform: travel, easing: "ease-in-out" }];
  let reveal;
  if (flips) {
    // Let the original digit land, then turn the two faces over in sequence.
    motion.push({ transform: "none", offset: .60 }, { transform: "none", offset: .66, easing: "ease-in" },
      { transform: "rotateX(90deg)", offset: .82 }, { transform: "rotateX(90deg)" });
    reveal = [
      { opacity: 0, transform: "rotateX(-90deg)" },
      { opacity: 0, transform: "rotateX(-90deg)", offset: .82, easing: "ease-out" },
      { opacity: 1, transform: "none" },
    ];
  } else {
    motion.push({ transform: "none", opacity: 1, offset: .90 }, { transform: "none", opacity: 0 });
    reveal = [{ opacity: 0 }, { opacity: 0, offset: .9 }, { opacity: 1 }];
  }
  const movement = ghost.animate(motion, timing);
  movement.onfinish = () => ghost.remove();
  destination.animate(reveal, timing);
}

export function renderWorkbench(element, { head, stage, update, animate = false }) {
  const a = slotName(head);
  const b = slotName(head + 1);
  const d = slotName(head + 3);
  const sheet = make("div", "wb-sheet");
  const board = make("div", "wb-board");
  sheet.append(board);
  board.append(heading());
  const transfers = [];
  let incomingZero;
  if (stage <= 1) {
    const oldest = wordRow(board, `Word ${a}`, "Keep left bit", update.oldest, { mark: [0] });
    const neighbor = wordRow(board, `Word ${b}`, "Keep right four", update.neighbor, { mark: [1, 2, 3, 4] });
    const joined = wordRow(board, "Joined word", `1 from ${a} · 4 from ${b}`, update.joined, {
      result: true, slots: stage === 0 ? [a, b, b, b, b] : undefined,
    });
    if (stage === 1) joined.forEach((cell, i) => transfers.push([i === 0 ? oldest[0] : neighbor[i], cell]));
  } else if (stage === 2) {
    const joined = wordRow(board, "Joined word", "Save the last bit", update.joined, { mark: [4] });
    shiftGuide(board);
    const shifted = wordRow(board, "Shifted word", "0 enters on the left", update.shifted, { result: true });
    incomingZero = shifted[0];
    const gate = savedBit(board, update.dropped, stage);
    for (let i = 0; i < 4; i++) transfers.push([joined[i], shifted[i + 1]]);
    transfers.push([joined[4], gate]);
  } else if (stage === 3) {
    const shifted = wordRow(board, "Shifted word", "After the shift", update.shifted);
    wordRow(board, "Twist mask", update.dropped ? "Flip marked bits" : "Skipped", update.mask, {
      xor: !!update.dropped, mark: update.dropped ? selectedBits(update.mask) : [],
    });
    const twisted = wordRow(board, "Twisted word", update.dropped ? "After XOR" : "Copy shifted word", update.twisted, { result: true });
    savedBit(board, update.dropped, stage);
    twisted.forEach((cell, i) => transfers.push([shifted[i], cell]));
  } else {
    const twisted = wordRow(board, "Twisted word", "After the twist", update.twisted);
    wordRow(board, `Word ${d}`, `Offset 3 from ${a}`, update.offset, { xor: true, mark: selectedBits(update.offset) });
    const next = wordRow(board, "New word", `Write to slot ${a}`, update.newWord, { result: true });
    next.forEach((cell, i) => transfers.push([twisted[i], cell]));
  }
  element.replaceChildren(sheet);
  if (animate && typeof sheet.animate === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    transfers.forEach(([from, to], i) => transfer(board, from, to, columnDelay * i));
    incomingZero?.animate([
      { transform: "translateX(-70%)", opacity: 0 },
      { transform: "translateX(0)", opacity: 1 },
    ], { duration: transferDuration, easing: "ease-out" });
  }
}
