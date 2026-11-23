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
  const left = compact ? 52 : 58;
  const right = width - 18;
  const top = 28;
  const side = right - left;
  const bottom = top + side;
  const unit = side / m;
  const X = input => left + input * unit;
  const Y = remainder => bottom - remainder * unit;

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${width}`);
  svg.setAttribute("role", "img");
  const title = "Wrapped generator map";
  const description = `Read the input on the horizontal axis and the remainder on the vertical axis. Starting at zero, the marker counts ${a * current + b} ticks, wrapping from the top at ${m} to the bottom at zero. At input ${current}, the generated remainder is ${next}.`;
  svg.setAttribute("aria-label", `${title}. ${description}`);
  add(svg, "title", {}, title);
  add(svg, "desc", {}, description);

  add(svg, "rect", { class: "plot-frame", x: left, y: top, width: side, height: side, fill: "#fbfdfc" });
  const axes = add(svg, "g", { "font-family": "inherit" });
  const grid = add(axes, "g", { "stroke-width": 1 });
  const step = tickStep(m / Math.max(2, Math.floor(side / 36)));
  const values = ticks(m - 1, step);
  if (values.length > 1 && (m - values.at(-1)) * unit < 23) values.pop();
  values.push(m);
  const ticksBehindResult = [];
  for (const value of values) {
    const x = X(value);
    const y = Y(value);
    line(grid, x, top, x, bottom, { stroke: "#dce6e4", "stroke-dasharray": "2 4" });
    line(grid, left, y, right, y, { stroke: "#dce6e4", "stroke-dasharray": "2 4" });
    line(axes, x, bottom, x, bottom + 4, { stroke: "#8e9f9f" });
    line(axes, left - 4, y, left, y, { stroke: "#8e9f9f" });
    label(axes, x, bottom + 18, value, { "text-anchor": "middle" });
    const tick = label(axes, left - 8, y + 4, value === m ? `${m} ≡ 0` : value, { "text-anchor": "end" });
    if (Math.abs(y - Y(next)) < 19) ticksBehindResult.push(tick);
  }
  line(axes, left, top, left, bottom, { stroke: "#849696" });
  line(axes, left, bottom, right, bottom, { stroke: "#849696" });
  label(axes, left, 16, "Remainder, xₙ₊₁", { "font-weight": 600 });
  label(axes, (left + right) / 2, width - 7, "Input state, xₙ", {
    "text-anchor": "middle", "font-weight": 600,
  });

  // Split at each raw multiple of m. The curve restarts at the bottom at
  // the same input, leaving the vertical jump out of the drawn rule.
  const rawEnd = a * m + b;
  const crossings = [];
  const pieces = [`M ${left} ${Y(b % m)}`];
  for (let level = (Math.floor(b / m) + 1) * m; level < rawEnd; level += m) {
    const x = X((level - b) / a);
    crossings.push(x);
    pieces.push(`L ${x} ${top} M ${x} ${bottom}`);
  }
  const end = a > 0 && rawEnd % m === 0 ? m : rawEnd % m;
  pieces.push(`L ${right} ${Y(end)}`);
  const rulePath = pieces.join(" ");
  const curve = add(svg, "g", { "stroke-linecap": "round" });
  add(curve, "path", { class: "plot-rule", d: rulePath, fill: "none", stroke: teal, "stroke-width": 2.6 });
  for (const x of crossings) {
    add(curve, "circle", { cx: x, cy: top, r: 3, stroke: teal, "stroke-width": 1.4, fill: "white" });
    add(curve, "circle", { cx: x, cy: bottom, r: 2.6, fill: teal });
  }
  add(curve, "circle", { cx: right, cy: Y(end), r: 3, fill: "white", stroke: teal, "stroke-width": 1.4 });
  const pointRadius = unit >= 9 ? 3.5 : 2.1;
  for (let input = 0; input < m; input++) {
    add(curve, "circle", {
      cx: X(input), cy: Y((a * input + b) % m), r: pointRadius,
      stroke: "#fff", "stroke-width": pointRadius > 3 ? 1.2 : 0.5, fill: teal,
    });
  }

  // Count b upward at input zero, then reveal the rule up to the marker's x.
  const clipId = `${svg.id || "generator-map"}-trace-clip`;
  const clip = add(curve, "clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" });
  const traceWindow = add(clip, "rect", { x: left, y: top - 3, height: side + 6 });
  const trace = add(curve, "g", { class: "plot-trace", fill: "none", stroke: orange, "stroke-width": 2.6 });
  const incrementLine = line(trace, left, bottom, left, bottom, { "stroke-dasharray": "3 3" });
  add(trace, "path", { d: rulePath, "clip-path": `url(#${clipId})` });

  const activeX = X(current);
  const activeY = Y(next);
  const marker = add(svg, "g", { "font-family": "inherit", "pointer-events": "none" });
  const result = add(marker, "g", { class: "plot-result" });
  add(result, "path", {
    d: `M ${left} ${activeY} H ${activeX} V ${bottom}`,
    stroke: orange, "stroke-width": 1.4, "stroke-dasharray": "4 4", fill: "none", opacity: .8,
  });
  const badge = add(result, "g", {
    class: "generated-value plot-output-badge", transform: `translate(${left - 7} ${activeY})`,
  });
  const badgeWidth = next < 10 ? 26 : 34;
  add(badge, "path", { d: "M -3 -5 L 5 0 L -3 5 Z", fill: "#99411f" });
  add(badge, "rect", { x: -badgeWidth, y: -12, width: badgeWidth, height: 24, rx: 5, fill: "#99411f" });
  label(badge, -badgeWidth / 2, 5, next, {
    "text-anchor": "middle", "font-size": 15, "font-weight": 700, fill: "#fff",
  });

  const cursor = add(marker, "g", { class: "plot-cursor" });
  add(cursor, "circle", { r: 7.5, fill: "#fff", stroke: orange, "stroke-width": 1.6 });
  add(cursor, "circle", { r: 4.4, fill: orange });

  let wasComplete;
  function setPosition({ remainder, input, distance, landed: complete }) {
    incrementLine.setAttribute("y2", Y(Math.min(b, m, distance)));
    traceWindow.setAttribute("width", input * unit);
    cursor.setAttribute("transform", `translate(${X(input)} ${Y(remainder)})`);
    if (complete !== wasComplete) {
      trace.setAttribute("visibility", complete ? "hidden" : "visible");
      result.setAttribute("visibility", complete ? "visible" : "hidden");
      result.classList.toggle("is-landed", complete);
      for (const tick of ticksBehindResult) tick.setAttribute("visibility", complete ? "hidden" : "visible");
      wasComplete = complete;
    }
  }
  setPosition(position);
  return setPosition;
}
