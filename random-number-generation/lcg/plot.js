import { pointOnRule } from "./generator.js?v=forward-motion";

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

// Where the unwrapped line crosses a multiple of the modulus, the wrapped
// graph has an open upper endpoint and a closed lower endpoint at the same x.
function crossings(a, b, m) {
  if (a === 0) return [];
  const result = [];
  const end = a * m + b;
  for (let level = (Math.floor(b / m) + 1) * m; level < end; level += m) {
    result.push({ x: (level - b) / a, level });
  }
  return result;
}

export function drawPlot(svg, { a, b, m, current, next, mode, startInput = current, progress = 1 }) {
  const wrapped = mode === "wrapped";
  const width = Math.max(240, Math.round(svg.getBoundingClientRect().width || 720));
  const compact = width < 490;
  const height = Math.round(Math.max(compact ? 254 : 280, Math.min(305, width * 0.47)));
  const left = compact ? 40 : 48;
  const right = width - 26;
  const top = 36;
  const bottom = height - 51;
  const raw = a * current + b;
  const base = raw - next;
  const rawEnd = a * m + b;
  // Six bands include the edge of the graph even for the slope-five examples.
  const bands = Math.ceil(rawEnd / m);
  const yMax = wrapped ? m : (bands <= 6 ? 6 : 5 * Math.ceil(bands / 5)) * m;
  const X = value => left + value / m * (right - left);
  const Y = value => bottom - value / yMax * (bottom - top);
  const breaks = crossings(a, b, m);

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  const title = wrapped ? "Wrapped recurrence on the Cartesian plane" : "Linear recurrence before wrapping";
  const description = wrapped
    ? `At input ${current}, the next value is ${next}. The line wraps to zero at every multiple of ${m}. Filled sample points mark the valid integer inputs.`
    : `At input ${current}, the line reaches ${raw}, which is ${next} above ${base}, a multiple of ${m}. Horizontal dashed lines mark multiples of ${m}.`;
  const chartDescription = `${description} The marker moves right to ${m} and continues at zero.`;
  svg.setAttribute("aria-label", `${title}. ${chartDescription}`);
  add(svg, "title", {}, title);
  add(svg, "desc", {}, chartDescription);

  add(svg, "rect", { x: left, y: top, width: right - left, height: bottom - top, fill: "#fbfdfc" });
  const axes = add(svg, "g", { "font-family": "inherit" });
  const grid = add(axes, "g", { "stroke-width": 1 });
  if (!wrapped) {
    // Bands remain legible for large increments and small moduli.
    const bandPixels = Math.abs(Y(m) - Y(0));
    if (bandPixels >= 10) {
      for (let level = 0; level < yMax; level += 2 * m) {
        add(grid, "rect", {
          x: left, y: Y(level + m), width: right - left, height: bandPixels, fill: "#f0f6f4",
        });
      }
    }
  }

  const xStep = tickStep(m / Math.max(2, Math.floor((right - left) / 39)));
  const xTicks = ticks(m - 1, xStep);
  // Reserve space for the longer tick label at the horizontal wrap.
  if (xTicks.length > 1 && right - X(xTicks.at(-1)) < 36) xTicks.pop();
  xTicks.push(m);
  for (const x of xTicks) {
    line(grid, X(x), top, X(x), bottom, { stroke: "#dce6e4", "stroke-dasharray": "2 4" });
    line(axes, X(x), bottom, X(x), bottom + 4, { stroke: "#8e9f9f" });
    label(axes, X(x), bottom + 19, x === m ? `${m} ≡ 0` : x, { "text-anchor": "middle" });
  }

  const yStep = wrapped
    ? tickStep(m / 6)
    : m * Math.max(1, Math.ceil(yMax / m / Math.max(2, Math.floor((bottom - top) / 26))));
  const yTicks = ticks(yMax, yStep);
  if (yTicks.at(-1) !== yMax) {
    if (Y(yTicks.at(-1)) - Y(yMax) < 19) yTicks.pop();
    yTicks.push(yMax);
  }
  if (!wrapped) {
    for (let level = m; level <= yMax; level += m) {
      line(grid, left, Y(level), right, Y(level), {
        stroke: yTicks.includes(level) ? "#a1b6b3" : "#cddcda",
        "stroke-dasharray": "5 5",
      });
    }
  }
  for (const level of yTicks) {
    if (wrapped && level > 0) {
      line(grid, left, Y(level), right, Y(level), {
        stroke: level === m ? "#a1b6b3" : "#dce6e4", "stroke-dasharray": "5 5",
      });
    }
    label(axes, left - 8, Y(level) + 4, level, { "text-anchor": "end" });
  }
  line(axes, left, top, left, bottom, { stroke: "#849696" });
  line(axes, left, bottom, right, bottom, { stroke: "#849696" });
  label(axes, left, 17, wrapped ? "Remainder" : "Unwrapped value", { "font-weight": 600 });
  label(axes, (left + right) / 2, height - 7, "Current state, xₙ", {
    "text-anchor": "middle", "font-weight": 600,
  });

  const curve = add(svg, "g", { "stroke-linecap": "round" });
  // Each modular boundary begins a new subpath. The base rule and the
  // highlighted portion share this path so their geometry always agrees.
  const pieces = [`M ${left} ${Y(wrapped ? b % m : b)}`];
  if (wrapped) {
    for (const point of breaks) {
      pieces.push(`L ${X(point.x)} ${Y(m)} M ${X(point.x)} ${Y(0)}`);
    }
  }
  // The edge is excluded. If the rule reaches a multiple of m exactly there,
  // the wrapped line approaches m from below before x restarts at zero.
  const edgeRemainder = a > 0 && rawEnd % m === 0 ? m : rawEnd % m;
  const edgeY = Y(wrapped ? edgeRemainder : rawEnd);
  pieces.push(`L ${right} ${edgeY}`);
  const rulePath = pieces.join(" ");
  add(curve, "path", { d: rulePath, fill: "none", stroke: teal, "stroke-width": 2.6 });
  const clipId = `${svg.id || "generator-map"}-trace-clip`;
  const clip = add(curve, "clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" });
  const clipBounds = { y: top - 3, height: bottom - top + 6 };
  const firstWindow = add(clip, "rect", { ...clipBounds, x: X(startInput) });
  const nextWindow = add(clip, "rect", { ...clipBounds, x: left });
  const trace = add(curve, "path", {
    class: "plot-trace", d: rulePath, fill: "none", stroke: orange, "stroke-width": 2.6,
    "clip-path": `url(#${clipId})`, "pointer-events": "none",
  });
  if (wrapped) {
    for (const point of breaks) {
      add(curve, "circle", { cx: X(point.x), cy: Y(m), r: 3, stroke: teal, "stroke-width": 1.4, fill: "white" });
      add(curve, "circle", { cx: X(point.x), cy: Y(0), r: 2.6, fill: teal });
    }
  }

  add(curve, "circle", { cx: right, cy: edgeY, r: 3.5, fill: "white", stroke: teal, "stroke-width": 1.4 });
  const pointRadius = (right - left) / m >= 14 ? 3.5 : 2.1;
  for (let x = 0; x < m; x++) {
    const value = a * x + b;
    add(curve, "circle", {
      cx: X(x), cy: Y(wrapped ? value % m : value), r: pointRadius,
      stroke: "#fff", "stroke-width": pointRadius > 3 ? 1.2 : 0.5, fill: teal,
    });
  }
  if (!wrapped) {
    for (const point of breaks) {
      const cx = X(point.x);
      const cy = Y(point.level);
      const atSample = Number.isInteger(point.x);
      let radius = atSample ? pointRadius + 2.5 : 4.1;
      if (point.x === current) radius = 10;
      const crossing = add(curve, "path", {
        d: `M ${cx} ${cy - radius} L ${cx + radius} ${cy} L ${cx} ${cy + radius} L ${cx - radius} ${cy} Z`,
        fill: atSample ? "transparent" : "#fff", stroke: teal, "stroke-width": 1.6,
      });
      const xValue = Number(point.x.toFixed(3));
      add(crossing, "title", {}, `Crosses ${point.level} at x ${xValue === point.x ? "=" : "≈"} ${xValue}`);
    }
  }

  const activeX = X(current);
  const activeY = Y(wrapped ? next : raw);
  const baseY = wrapped ? bottom : Y(base);
  const marker = add(svg, "g", { "font-family": "inherit", "pointer-events": "none" });
  const startX = X(startInput);
  const startRaw = pointOnRule(a, b, startInput, current, 0, m).raw;
  const startDot = add(marker, "circle", {
    cx: startX, cy: Y(wrapped ? startRaw % m : startRaw), r: 3.7,
    fill: "#fff", stroke: orange, "stroke-width": 1.5,
  });
  const landed = add(marker, "g", {});
  if (baseY < bottom) {
    line(landed, activeX, bottom, activeX, baseY, { stroke: orange, opacity: 0.64, "stroke-dasharray": "3 4" });
  }
  line(landed, activeX, baseY, activeX, activeY, {
    stroke: orange, "stroke-width": wrapped ? 1.8 : 3,
    "stroke-dasharray": wrapped ? "4 4" : "none",
  });
  if (!wrapped && next > 0) {
    line(landed, activeX - 4, baseY, activeX + 4, baseY, { stroke: orange, "stroke-width": 2 });
  }
  const cursor = add(marker, "g", { class: "plot-cursor" });
  const ring = add(cursor, "circle", { r: 7.5, fill: "#fff", stroke: orange, "stroke-width": 1.6 });
  add(cursor, "circle", { r: 4.4, fill: orange });

  const annotation = add(landed, "g", {});
  const caption = wrapped ? `(${current}, ${next})` : `(${current}, ${raw}) · remainder ${next}`;
  const note = label(annotation, 0, 0, caption, { fill: "#93401f", "font-weight": 600, "font-size": 13 });
  const noteWidth = Math.ceil(note.getComputedTextLength()) + 16;
  const noteHeight = 24;
  const putLeft = activeX - left >= noteWidth + 13;
  const noteX = Math.max(left + 2, Math.min(right - noteWidth, putLeft ? activeX - 12 - noteWidth : activeX + 12));
  const fitsAbove = activeY - noteHeight - 8 >= top;
  const noteY = fitsAbove ? activeY - noteHeight - 8 : activeY + 10;
  const box = add(annotation, "rect", {
    x: noteX, y: noteY, width: noteWidth, height: noteHeight, rx: 5,
    fill: "#fff6ef", stroke: "#e7b99f",
  });
  annotation.insertBefore(box, note);
  note.setAttribute("x", noteX + 8);
  note.setAttribute("y", noteY + 16.5);

  function setProgress(value) {
    const t = Math.max(0, Math.min(1, value));
    const point = pointOnRule(a, b, startInput, current, t, m);
    const x = X(point.x);
    const y = Y(wrapped ? point.raw % m : point.raw);
    const crossedEdge = point.unwrappedX >= m;
    firstWindow.setAttribute("width", (crossedEdge ? right : x) - startX);
    nextWindow.setAttribute("width", crossedEdge ? x - left : 0);
    trace.setAttribute("visibility", t < 1 ? "visible" : "hidden");
    startDot.setAttribute("visibility", t < 1 ? "visible" : "hidden");
    landed.setAttribute("visibility", t === 1 ? "visible" : "hidden");
    cursor.setAttribute("transform", `translate(${x} ${y})`);
    if (startInput === current) ring.setAttribute("r", 7.5 + 3 * Math.sin(Math.PI * t));
  }
  setProgress(progress);
  return setProgress;
}
