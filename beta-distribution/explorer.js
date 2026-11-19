"use strict";

const minShape = 0.001;
const maxConcentration = 10000;
const sliderSteps = 1000;
const endpointCutoff = 0.01;
const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const byId = id => document.getElementById(id);
const canvas = byId("density-chart");
const compare = byId("compare");

function display(value) {
  return value > 0 && value < 0.00005 ? value.toExponential(2) : formatter.format(value);
}

function shapesFromMode(omega, k) {
  const excess = k - 2;
  return { alpha: 1 + omega * excess, beta: 1 + (1 - omega) * excess };
}

function describe({ alpha, beta }) {
  const k = alpha + beta;
  const excess = (alpha - 1) + (beta - 1);
  const omega = alpha >= 1 && beta >= 1 && k > 2 ? (alpha - 1) / excess : null;
  const poles = [];
  if (alpha < 1) poles.push(0);
  if (beta < 1) poles.push(1);
  return {
    alpha, beta, omega, k, poles,
    mean: alpha / k,
    modes: omega === null ? poles : [omega]
  };
}

const lanczosCoefficients = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531,
  -176.6150291621406, 12.507343278686905, -0.13857109526572012,
  9.984369578019572e-6, 1.5056327351493116e-7
];

// Evaluate the normalizing constant in log space for large shapes.
function logGamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const x = z - 1;
  const sum = lanczosCoefficients.reduce(
    (total, term, i) => total + term / (x + i + 1), 0.9999999999998099
  );
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

function densityFor(alpha, beta) {
  const logNormalizer = logGamma(alpha + beta) - logGamma(alpha) - logGamma(beta);
  return x => {
    if (x === 0) return alpha < 1 ? Infinity : alpha === 1 ? beta : 0;
    if (x === 1) return beta < 1 ? Infinity : beta === 1 ? alpha : 0;
    return Math.exp(logNormalizer + (alpha - 1) * Math.log(x) + (beta - 1) * Math.log1p(-x));
  };
}

function inputBounds(key, parameters) {
  switch (key) {
    case "alpha": return [minShape, maxConcentration - parameters.beta];
    case "beta": return [minShape, maxConcentration - parameters.alpha];
    case "omega": return [0, 1];
    case "k": return [2, maxConcentration];
  }
}

function sliderBounds(key, parameters) {
  return key === "k" ? [2.001, maxConcentration] : inputBounds(key, parameters);
}

function toSlider(key, value, parameters) {
  if (key === "omega") return Math.round(sliderSteps * (value ?? 0));
  const [low, high] = sliderBounds(key, parameters);
  if (value <= low || high <= low) return 0;
  return Math.min(sliderSteps, Math.round(sliderSteps * Math.log(value / low) / Math.log(high / low)));
}

function fromSlider(key, position, parameters) {
  const weight = position / sliderSteps;
  if (key === "omega") return weight;
  const [low, high] = sliderBounds(key, parameters);
  if (position === 0) return low;
  if (position === sliderSteps) return high;
  const value = Number((low * (high / low) ** weight).toPrecision(8));
  return Math.max(low, Math.min(high, value));
}

function createView(index, controls, summary, initial) {
  controls.append(byId("parameter-template").content.cloneNode(true));
  summary.append(byId("summary-template").content.cloneNode(true));
  controls.querySelector("[data-distribution-title]").textContent = `Distribution ${index}`;
  const view = {
    controls, summary, values: initial,
    fields: {},
    color: getComputedStyle(controls).getPropertyValue("--series").trim(),
    status: controls.querySelector(".validation")
  };
  view.status.id = `distribution-${index}-status`;
  for (const row of controls.querySelectorAll("[data-parameter]")) {
    const key = row.dataset.parameter;
    const label = row.querySelector("label");
    const range = row.querySelector('input[type="range"]');
    const number = row.querySelector('input[type="number"]');
    const name = `Distribution ${index} ${label.textContent}`;
    range.min = 0;
    range.max = sliderSteps;
    range.step = 1;
    range.setAttribute("aria-label", `${name} slider`);
    number.id = `distribution-${index}-${key}`;
    number.setAttribute("aria-label", name);
    number.setAttribute("aria-describedby", view.status.id);
    label.htmlFor = number.id;
    view.fields[key] = { range, number, label: label.textContent };

    range.addEventListener("input", () => {
      update(view, key, fromSlider(key, range.valueAsNumber, view.values));
    });
    number.addEventListener("input", () => update(view, key, number.valueAsNumber, number));
  }
  syncControls(view);
  return view;
}

function syncControls(view, edited) {
  const state = describe(view.values);
  const available = state.omega !== null;
  view.controls.querySelector(".alternative").disabled = !available;
  view.controls.querySelector(".formula").hidden = !available;
  view.controls.querySelector(".unavailable").hidden = available;
  view.status.hidden = true;
  view.status.textContent = "";
  for (const [key, { range, number }] of Object.entries(view.fields)) {
    const value = state[key];
    const [low, high] = inputBounds(key, state);
    number.min = low;
    number.max = high;
    number.removeAttribute("aria-invalid");
    if (number !== edited) number.value = value === null ? "" : String(Number(value.toPrecision(8)));
    range.value = toSlider(key, value, state);
    range.setAttribute("aria-valuetext", value === null ? "Unavailable" : display(value));
  }
}

function update(view, key, value, edited) {
  const [low, high] = inputBounds(key, view.values);
  const invalid = !Number.isFinite(value) || value < low || value > high || (key === "k" && value === 2);
  if (invalid) {
    view.fields[key].number.setAttribute("aria-invalid", "true");
    view.status.textContent = key === "k"
      ? `Enter a concentration greater than 2 and at most ${display(high)}.`
      : `Enter ${view.fields[key].label} from ${display(low)} to ${display(high)}.`;
    view.status.hidden = false;
    return;
  }

  if (key === "alpha" || key === "beta") {
    view.values[key] = value;
  } else {
    const { omega, k } = describe(view.values);
    view.values = shapesFromMode(key === "omega" ? value : omega, key === "k" ? value : k);
  }
  syncControls(view, edited);
  refresh();
}

function showSummary(view) {
  const p = describe(view.values);
  const mode = p.modes.length ? p.modes.map(display).join(" and ") : "Every x in [0, 1]";
  view.summary.querySelector("[data-beta-label]").textContent = `Beta(${display(p.alpha)}, ${display(p.beta)})`;
  view.summary.querySelector("[data-mean]").textContent = display(p.mean);
  view.summary.querySelector("[data-mode]").textContent = mode;
  const boundary = view.summary.querySelector("[data-boundary]");
  boundary.hidden = !p.poles.length;
  boundary.textContent = p.poles.length
    ? `Density grows without bound at ${p.poles.map(x => `x = ${x}`).join(" and ")}. The axis uses values away from those peaks.`
    : "";
}

const views = [
  createView(1, byId("first-controls"), byId("first-summary"), { alpha: 81, beta: 219 }),
  createView(2, byId("second-controls"), byId("second-summary"), shapesFromMode(80 / 298, 75))
];

function sampleDensity(view, segments) {
  const p = describe(view.values);
  const density = densityFor(p.alpha, p.beta);
  const xs = Array.from({ length: segments + 1 }, (_, i) => i / segments);
  // Include the exact interior peak and extra points near each boundary.
  xs.push(p.mean, ...p.modes.filter(x => x > 0 && x < 1));
  for (let power = 2; power <= 9; power++) {
    xs.push(10 ** -power, 1 - 10 ** -power);
  }
  xs.sort((a, b) => a - b);
  const points = xs.map(x => [x, density(x)]);
  return { ...p, points, color: view.color };
}

function axisFor(series) {
  let peak = 1;
  for (const { points, poles } of series) {
    const low = poles.includes(0) ? endpointCutoff : 0;
    const high = poles.includes(1) ? 1 - endpointCutoff : 1;
    for (const [x, y] of points) {
      if (x >= low && x <= high) peak = Math.max(peak, y);
    }
  }
  const targetStep = peak * 1.07 / 5;
  const power = 10 ** Math.floor(Math.log10(targetStep));
  const step = [1, 2, 2.5, 5, 10].find(unit => unit * power >= targetStep) * power;
  const ticks = Math.ceil(peak * 1.07 / step);
  return { step, ticks, top: ticks * step };
}

function drawChart() {
  const { width, height } = canvas.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  const scale = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * scale);
  const pixelHeight = Math.round(height * scale);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const left = width < 425 ? 52 : 62;
  const top = 14;
  const right = width - 12;
  const bottom = height - 48;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const active = compare.checked ? views : views.slice(0, 1);
  const series = active.map(view => sampleDensity(view, Math.max(600, Math.ceil(plotWidth * 2))));
  const axis = axisFor(series);
  const xAt = x => left + x * plotWidth;
  const yAt = y => bottom - y / axis.top * plotHeight;

  ctx.fillStyle = "#f9fbfe";
  ctx.fillRect(left, top, plotWidth, plotHeight);
  ctx.font = `${width < 425 ? 12 : 14}px "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  for (let i = 0; i <= axis.ticks; i++) {
    const value = i * axis.step;
    const y = yAt(value);
    line(ctx, left, y, right, y, i === 0 ? "#9badbd" : "#dde7f0");
    ctx.fillStyle = "#4d6175";
    ctx.fillText(display(value), left - 7, y);
  }

  ctx.textAlign = "center";
  for (let i = 0; i <= 5; i++) {
    const value = i / 5;
    const x = xAt(value);
    line(ctx, x, top, x, bottom, i === 0 ? "#9badbd" : "#e4ebf3");
    ctx.fillStyle = "#4d6175";
    ctx.fillText(display(value), x, bottom + 14);
  }
  ctx.fillStyle = "#183047";
  ctx.fillText("x", (left + right) / 2, bottom + 35);
  ctx.save();
  ctx.translate(9, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Density", 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(left - 1, top, plotWidth + 2, plotHeight + 1);
  ctx.clip();
  for (const { color, mean, modes } of series) {
    ctx.globalAlpha = 0.78;
    for (const mode of modes) {
      ctx.setLineDash([6, 4]);
      line(ctx, xAt(mode), top, xAt(mode), bottom, color, 1.25);
    }
    if (!modes.some(mode => Math.abs(mean - mode) < 1e-12)) {
      ctx.setLineDash([2, 3]);
      line(ctx, xAt(mean), top, xAt(mean), bottom, color, 1.25);
    }
    ctx.globalAlpha = 1;
  }
  for (const [index, { color, points }] of series.entries()) {
    ctx.beginPath();
    const boundedY = y => yAt(Math.min(y, axis.top * 2));
    ctx.moveTo(xAt(points[0][0]), boundedY(points[0][1]));
    for (const [x, y] of points.slice(1)) ctx.lineTo(xAt(x), boundedY(y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.7;
    ctx.lineJoin = "round";
    ctx.setLineDash(index === 0 ? [] : [8, 4]);
    ctx.stroke();
  }
  ctx.restore();
}

function line(ctx, x0, y0, x1, y1, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

let pendingFrame = 0;
function queueDraw() {
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    drawChart();
  });
}

function refresh() {
  const enabled = compare.checked;
  views[1].controls.hidden = !enabled;
  views[1].summary.hidden = !enabled;
  compare.closest(".controls").classList.toggle("is-comparing", enabled);
  showSummary(views[0]);
  if (enabled) showSummary(views[1]);
  queueDraw();
}

compare.addEventListener("change", refresh);
new ResizeObserver(queueDraw).observe(canvas);
refresh();
