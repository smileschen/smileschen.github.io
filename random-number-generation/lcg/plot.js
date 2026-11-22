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
  const end = a * (m - 1) + b;
  for (let level = (Math.floor(b / m) + 1) * m; level <= end; level += m) {
    result.push({ x: (level - b) / a, level });
  }
  return result;
}

export function drawPlot(svg, { a, b, m, current, next, mode, progress = 1 }) {
  const wrapped = mode === "wrapped";
  const width = Math.max(240, Math.round(svg.getBoundingClientRect().width || 720));
  const compact = width < 490;
  const height = Math.round(Math.max(compact ? 254 : 280, Math.min(305, width * 0.47)));
  const left = compact ? 40 : 48;
  const right = width - (compact ? 16 : 24);
  const top = 36;
  const bottom = height - 51;
  const raw = a * current + b;
  const base = raw - next;
  const lastState = m - 1;
  const rawEnd = a * lastState + b;
  // A shared scale across neighboring slopes makes the change in steepness visible.
  const fiveBands = 5 * m;
  const yMax = wrapped ? m : Math.max(1, Math.ceil(rawEnd / fiveBands)) * fiveBands;
  const X = value => left + value / lastState * (right - left);
  const Y = value => bottom - value / yMax * (bottom - top);
  const breaks = crossings(a, b, m);

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  const title = wrapped ? "Wrapped recurrence on the Cartesian plane" : "Linear recurrence before wrapping";
  const description = wrapped
    ? `At input ${current}, the next value is ${next}. The line wraps to zero at every multiple of ${m}. Filled sample points mark the valid integer inputs.`
    : `At input ${current}, the line reaches ${raw}, which is ${next} above ${base}, a multiple of ${m}. Horizontal dashed lines mark multiples of ${m}.`;
  svg.setAttribute("aria-label", `${title}. ${description}`);
  add(svg, "title", {}, title);
  add(svg, "desc", {}, description);

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

  const xStep = tickStep(lastState / Math.max(2, Math.floor((right - left) / 39)));
  const xTicks = ticks(lastState, xStep);
  // Keep the last valid input visible, even when it is off the regular tick interval.
  if (xTicks.at(-1) !== lastState) {
    if (X(lastState) - X(xTicks.at(-1)) < 26) xTicks.pop();
    xTicks.push(lastState);
  }
  for (const x of xTicks) {
    line(grid, X(x), top, X(x), bottom, { stroke: "#dce6e4", "stroke-dasharray": "2 4" });
    line(axes, X(x), bottom, X(x), bottom + 4, { stroke: "#8e9f9f" });
    label(axes, X(x), bottom + 19, x, { "text-anchor": "middle" });
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
  const rule = { stroke: teal, "stroke-width": 2.6 };
  if (wrapped) {
    let start = 0;
    let startValue = b % m;
    for (const point of breaks) {
      line(curve, X(start), Y(startValue), X(point.x), Y(m), rule);
      add(curve, "circle", { cx: X(point.x), cy: Y(m), r: 3, stroke: teal, "stroke-width": 1.4, fill: "white" });
      add(curve, "circle", { cx: X(point.x), cy: Y(0), r: 2.6, fill: teal });
      start = point.x;
      startValue = 0;
    }
    line(curve, X(start), Y(startValue), right, Y(rawEnd % m), rule);
  } else {
    line(curve, left, Y(b), right, Y(rawEnd), rule);
  }

  const pointRadius = (right - left) / lastState >= 14 ? 3.5 : 2.1;
  for (let x = 0; x <= lastState; x++) {
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
  const moving = add(marker, "g", {});
  const trace = add(moving, "path", {
    class: "plot-trace", fill: "none", stroke: orange, "stroke-width": 2.6,
  });
  add(moving, "circle", { cx: activeX, cy: Y(current), r: 3.7, fill: "#fff", stroke: orange, "stroke-width": 1.5 });
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

  // Each turn after the first retraces the same vertical interval. Move the
  // pen at the modular boundary so the jump never adds a connecting stroke.
  const startPath = `M ${activeX} ${Y(current)}`;
  const wrapPath = ` V ${Y(m)} M ${activeX} ${bottom}`;
  function setProgress(value) {
    const t = Math.max(0, Math.min(1, value));
    const output = current + (raw - current) * t;
    const band = Math.floor(output / m);
    const y = Y(wrapped ? output % m : output);
    const turns = wrapped ? Math.min(2, band) : 0;
    trace.setAttribute("d", `${startPath}${wrapPath.repeat(turns)} V ${y}`);
    moving.setAttribute("visibility", t < 1 ? "visible" : "hidden");
    landed.setAttribute("visibility", t === 1 ? "visible" : "hidden");
    cursor.setAttribute("transform", `translate(${activeX} ${y})`);
    if (raw === current) ring.setAttribute("r", 7.5 + 3 * Math.sin(Math.PI * t));
  }
  setProgress(progress);
  return setProgress;
}
