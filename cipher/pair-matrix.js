(() => {
  "use strict";

  const symbols = [...window.CipherEngine.alphabet, "□"];
  const size = symbols.length;
  const logs = window.CipherModel.logPairs;
  const lightToDark = ["#f4f7ee", "#e2edda", "#cbdcbf", "#accbaa", "#87b593", "#629c7b", "#418267", "#246451", "#154b3d"];
  const minLog = Math.min(...logs);
  const maxLog = Math.max(...logs);
  const table = document.getElementById("pair-matrix");
  const disclosure = document.getElementById("pair-matrix-details");
  const numbers = document.getElementById("matrix-numbers");
  const readout = document.getElementById("matrix-readout");
  const cells = [];
  let used = new Map();
  let selected = 19 * size + 7; // TH is the initial example when no word is selected.
  let shown = null;

  function symbolName(index) {
    return index === size - 1 ? "space" : symbols[index];
  }

  function probability(value, digits) {
    return Number(value.toPrecision(digits)).toString();
  }

  function describe(index) {
    const row = Math.floor(index / size);
    const col = index % size;
    const count = used.get(index);
    const usage = count ? " · used " + (count === 1 ? "once" : count + " times") + " in this word" : "";
    return symbolName(row) + " → " + symbolName(col) + " · P = " +
      probability(Math.exp(logs[index]), 7) + " · ln P = " + logs[index].toFixed(5) + usage;
  }

  function display(index) {
    if (!cells.length) return;
    if (shown !== null) cells[shown].classList.remove("matrix-active");
    shown = index;
    cells[index].classList.add("matrix-active");
    readout.textContent = describe(index);
  }

  function select(index) {
    if (cells.length) {
      cells[selected].tabIndex = -1;
      cells[index].tabIndex = 0;
    }
    selected = index;
    display(index);
  }

  function mark(index) {
    const cell = cells[index];
    cell.classList.toggle("matrix-used", used.has(index));
    cell.setAttribute("aria-label", describe(index));
  }

  function header(row, label, scope) {
    const th = document.createElement("th");
    th.scope = scope;
    th.textContent = label;
    row.append(th);
    return th;
  }

  function build() {
    if (cells.length) return;
    const headers = table.createTHead().insertRow();
    header(headers, "↓ →", "col").setAttribute("aria-label", "First symbol by row, second symbol by column");
    symbols.forEach(symbol => header(headers, symbol, "col"));
    const body = table.createTBody();
    symbols.forEach((symbol, rowIndex) => {
      const row = body.insertRow();
      header(row, symbol, "row");
      for (let col = 0; col < size; col++) {
        const index = rowIndex * size + col;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.index = index;
        button.tabIndex = index === selected ? 0 : -1;
        const shade = Math.round((logs[index] - minLog) / (maxLog - minLog) * (lightToDark.length - 1));
        button.style.backgroundColor = lightToDark[shade];
        button.style.color = shade >= 6 ? "#fff" : "#102d20";
        const number = document.createElement("span");
        number.textContent = probability(Math.exp(logs[index]), 3);
        button.append(number);
        row.insertCell().append(button);
        cells.push(button);
        mark(index);
      }
    });
    display(selected);
  }

  // The inspector can select another spelling while the matrix is folded.
  // Defer building its 729 cells until a student opens the matrix.
  function highlight(pairs) {
    const previous = used;
    used = new Map();
    for (const {from, to} of pairs) {
      const index = from * size + to;
      used.set(index, (used.get(index) || 0) + 1);
    }
    if (cells.length) {
      for (const index of new Set([...previous.keys(), ...used.keys()])) mark(index);
    }
    select(used.size ? used.keys().next().value : selected);
  }

  function cellFor(event) {
    return event.target.closest("button[data-index]");
  }

  table.addEventListener("pointerover", event => {
    const button = cellFor(event);
    if (button) display(Number(button.dataset.index));
  });
  table.addEventListener("pointerleave", () => display(selected));
  for (const type of ["focusin", "click"]) {
    table.addEventListener(type, event => {
      const button = cellFor(event);
      if (button) select(Number(button.dataset.index));
    });
  }
  table.addEventListener("keydown", event => {
    const button = cellFor(event);
    if (!button) return;
    const index = Number(button.dataset.index);
    const row = Math.floor(index / size);
    const col = index % size;
    let next;
    switch (event.key) {
      case "ArrowLeft": next = row * size + Math.max(0, col - 1); break;
      case "ArrowRight": next = row * size + Math.min(size - 1, col + 1); break;
      case "ArrowUp": next = Math.max(0, row - 1) * size + col; break;
      case "ArrowDown": next = Math.min(size - 1, row + 1) * size + col; break;
      case "Home": next = event.ctrlKey ? 0 : row * size; break;
      case "End": next = event.ctrlKey ? size * size - 1 : row * size + size - 1; break;
      default: return;
    }
    event.preventDefault();
    cells[next].focus();
  });
  numbers.addEventListener("change", () => table.classList.toggle("matrix-numeric", numbers.checked));
  disclosure.addEventListener("toggle", () => { if (disclosure.open) build(); });

  function locate(from, to) {
    disclosure.open = true;
    build();
    const index = from * size + to;
    select(index);
    cells[index].focus();
  }
  window.CipherPairMatrix = {highlight, locate};
})();
