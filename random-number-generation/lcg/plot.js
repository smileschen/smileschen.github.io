const NS = "http://www.w3.org/2000/svg";
const ink = "#425466";
const teal = "#147d78";
const orange = "#b34e28";

function add(parent, tag, attributes, content) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  if (content !== undefined) element.textContent = content;
  parent.appendChild(element);
  return element;
}

function line(parent, x1, y1, x2, y2, attributes) {
  return add(parent, "line", { x1, y1, x2, y2, ...attributes });
}

function label(parent, x, y, content, attributes = {}) {
  return add(parent, "text", { x, y, fill: ink, "font-size": 13, ...attributes }, content);
}

function tickStep(desired) {
  if (desired <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(desired));
  return magnitude * [1, 2, 5, 10].find(n => n * magnitude >= desired);
}

function ticks(limit, step) {
  const result = [];
  for (let n = 0; n <= limit; n += step) result.push(n);
  return result;
}

export function drawPlot(svg, { a, b, m, current, next, position }) {
  const width = Math.max(240, Math.round(svg.getBoundingClientRect().width || 720));
  const compact = width < 490;
  const height = Math.round(Math.max(compact ? 254 : 280, Math.min(305, width * 0.47)));
  const left = compact ? 40 : 48;
  const right = width - 26;
  const top = 36;
  const bottom = height - 51;
  const X = remainder => left + remainder / m * (right - left);
  const Y = input => bottom - input / m * (bottom - top);

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  const title = "Wrapped generator map";
  const description = `Read the input on the vertical axis and its remainder on the horizontal axis. Starting at zero, the marker counts ${a * current + b} ticks, wrapping from ${m} to zero. At input ${current}, the remainder is ${next}.`;
  svg.setAttribute("aria-label", `${title}. ${description}`);
  add(svg, "title", {}, title);
  add(svg, "desc", {}, description);

  add(svg, "rect", { x: left, y: top, width: right - left, height: bottom - top, fill: "#fbfdfc" });
  const axes = add(svg, "g", { "font-family": "inherit" });
  const grid = add(axes, "g", { "stroke-width": 1 });
  const xStep = tickStep(m / Math.max(2, Math.floor((right - left) / 39)));
  const xTicks = ticks(m - 1, xStep);
  if (xTicks.length > 1 && right - X(xTicks.at(-1)) < 36) xTicks.pop();
  xTicks.push(m);
  for (const x of xTicks) {
    line(grid, X(x), top, X(x), bottom, { stroke: "#dce6e4", "stroke-dasharray": "2 4" });
    line(axes, X(x), bottom, X(x), bottom + 4, { stroke: "#8e9f9f" });
    label(axes, X(x), bottom + 19, x === m ? `${m} ≡ 0` : x, { "text-anchor": "middle" });
  }

  const yTicks = ticks(m, tickStep(m / 6));
  if (yTicks.at(-1) !== m) {
    if (Y(yTicks.at(-1)) - top < 19) yTicks.pop();
    yTicks.push(m);
  }
  for (const input of yTicks) {
    if (input > 0) {
      line(grid, left, Y(input), right, Y(input), { stroke: "#dce6e4", "stroke-dasharray": "5 5" });
    }
    label(axes, left - 8, Y(input) + 4, input, { "text-anchor": "end" });
  }
  line(axes, left, top, left, bottom, { stroke: "#849696" });
  line(axes, left, bottom, right, bottom, { stroke: "#849696" });
  label(axes, left, 17, "Input state, xₙ", { "font-weight": 600 });
  label(axes, (left + right) / 2, height - 7, "Remainder, xₙ₊₁", {
    "text-anchor": "middle", "font-weight": 600,
  });

  // Parameterize the curve by input. At each raw multiple of m, split the
  // path between the right and left boundaries at exactly the same height.
  const rawEnd = a * m + b;
  const crossings = [];
  const pieces = [`M ${X(b % m)} ${bottom}`];
  for (let level = (Math.floor(b / m) + 1) * m; level < rawEnd; level += m) {
    const y = Y((level - b) / a);
    crossings.push(y);
    pieces.push(`L ${right} ${y} M ${left} ${y}`);
  }
  const end = a > 0 && rawEnd % m === 0 ? m : rawEnd % m;
  pieces.push(`L ${X(end)} ${top}`);
  const rulePath = pieces.join(" ");
  const curve = add(svg, "g", { "stroke-linecap": "round" });
  add(curve, "path", { d: rulePath, fill: "none", stroke: teal, "stroke-width": 2.6 });
  for (const y of crossings) {
    add(curve, "circle", { cx: right, cy: y, r: 3, stroke: teal, "stroke-width": 1.4, fill: "white" });
    add(curve, "circle", { cx: left, cy: y, r: 2.6, fill: teal });
  }
  add(curve, "circle", { cx: X(end), cy: top, r: 3, fill: "white", stroke: teal, "stroke-width": 1.4 });
  const pointRadius = (bottom - top) / m >= 9 ? 3.5 : 2.1;
  for (let input = 0; input < m; input++) {
    add(curve, "circle", {
      cx: X((a * input + b) % m), cy: Y(input), r: pointRadius,
      stroke: "#fff", "stroke-width": pointRadius > 3 ? 1.2 : 0.5, fill: teal,
    });
  }

  // The initial horizontal leg counts the increment. The rest of the
  // traveled path is the portion of the generator map up to the current row.
  const clipId = `${svg.id || "generator-map"}-trace-clip`;
  const clip = add(curve, "clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" });
  const traceWindow = add(clip, "rect", { x: left - 3, width: right - left + 6 });
  const trace = add(curve, "g", { class: "plot-trace", fill: "none", stroke: orange, "stroke-width": 2.6 });
  const incrementLine = line(trace, left, bottom, left, bottom, { "stroke-dasharray": "3 3" });
  add(trace, "path", { d: rulePath, "clip-path": `url(#${clipId})` });

  const activeX = X(next);
  const activeY = Y(current);
  const marker = add(svg, "g", { "font-family": "inherit", "pointer-events": "none" });
  const landed = add(marker, "g", {});
  add(landed, "path", {
    d: `M ${left} ${activeY} H ${activeX} V ${bottom}`,
    stroke: orange, "stroke-width": 1.4, "stroke-dasharray": "4 4", fill: "none", opacity: .7,
  });
  const note = label(landed, 0, 0, `Input ${current} → ${next}`, {
    fill: "#93401f", "font-weight": 600, "font-size": 13,
  });
  const noteWidth = Math.ceil(note.getComputedTextLength()) + 16;
  const putLeft = activeX - left >= noteWidth + 13;
  const noteX = Math.max(left + 2, Math.min(right - noteWidth, putLeft ? activeX - 12 - noteWidth : activeX + 12));
  const noteY = activeY - 32 >= top ? activeY - 32 : activeY + 10;
  const box = add(landed, "rect", {
    x: noteX, y: noteY, width: noteWidth, height: 24, rx: 5, fill: "#fff6ef", stroke: "#e7b99f",
  });
  landed.insertBefore(box, note);
  note.setAttribute("x", noteX + 8);
  note.setAttribute("y", noteY + 16.5);

  const cursor = add(marker, "g", { class: "plot-cursor" });
  add(cursor, "circle", { r: 7.5, fill: "#fff", stroke: orange, "stroke-width": 1.6 });
  add(cursor, "circle", { r: 4.4, fill: orange });

  function setPosition({ remainder, input, distance, landed: complete }) {
    const y = Y(input);
    incrementLine.setAttribute("x2", X(Math.min(b, m, distance)));
    traceWindow.setAttribute("y", y);
    traceWindow.setAttribute("height", bottom - y);
    trace.setAttribute("visibility", complete ? "hidden" : "visible");
    landed.setAttribute("visibility", complete ? "visible" : "hidden");
    cursor.setAttribute("transform", `translate(${X(remainder)} ${y})`);
  }
  setPosition(position);
  return setPosition;
}
