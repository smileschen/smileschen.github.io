import { getOrbit, presets } from "./generator.js";
import { drawPlot } from "./plot.js?v=dial";
import { createDial } from "./dial.js";

const byId = id => document.getElementById(id);
const parameters = [
  { key: "a", name: "Multiplier", hint: "Slope of the line", symbol: "a", min: 0, max: 16 },
  { key: "b", name: "Increment", hint: "Vertical intercept", symbol: "b", min: 0, max: 63 },
  { key: "m", name: "Modulus", hint: "Height of each band", symbol: "m", min: 2, max: 64 },
  { key: "seed", name: "Seed", hint: "Starting value", symbol: "x<sub>0</sub>", min: 0 },
];
const picker = byId("preset");
const svg = byId("plot");
const dial = createDial(byId("dial"));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const valueList = byId("values");
let example = presets[0];
let settings = { ...example };
let orbit = getOrbit(settings);
let step = 0;
let mode = "line";
let progress = 1;
let playback = "idle";
let continuous = false;
let frame;
let hold;
let moveGraph;

function maxFor(parameter) {
  return parameter.max ?? settings.m - 1;
}

function lastStep() {
  return orbit.values.length - 2;
}

function draw() {
  moveGraph = drawPlot(svg, { ...settings, current: orbit.values[step], next: orbit.values[step + 1], mode, progress });
  drawDial();
}

function drawDial() {
  const from = orbit.values[step];
  const to = orbit.values[step + 1];
  const raw = settings.a * from + settings.b;
  const position = from + (raw - from) * progress;
  dial.update({ m: settings.m, from, to, position, progress });
}

function setProgress(value) {
  progress = value;
  moveGraph(progress);
  drawDial();
}

function renderPlayback() {
  const running = playback === "running";
  const label = running ? "Pause" : playback === "paused" ? "Resume" : step === lastStep() ? "Replay" : "Play";
  byId("play-label").textContent = label;
  byId("play-icon").setAttribute("d", running ? "M4 3h3v12H4ZM11 3h3v12h-3Z" : "M5 3.5 14 9l-9 5.5Z");
}

function renderStep(announce = false) {
  const { a, b, m } = settings;
  const current = orbit.values[step];
  const next = orbit.values[step + 1];
  const raw = a * current + b;
  byId("update-label").textContent = `Update ${step + 1} of ${lastStep() + 1}`;
  byId("calculation").innerHTML = `<span class="raw">${a} × ${current} + ${b} = ${raw}</span><span class="remainder">${raw} mod ${m} = <strong>${next}</strong></span>`;
  byId("previous").disabled = step === 0;
  byId("next").disabled = step === lastStep();
  const wraps = Math.floor(raw / m);
  let dialCaption = `Move from ${current} to ${next} ${raw < current ? "counterclockwise" : "clockwise"}.`;
  if (wraps > 0) dialCaption = `Start at ${current}, pass zero ${wraps === 1 ? "once" : `${wraps} times`}, and land on ${next}.`;
  if (raw === current) dialCaption = `The hand stays on ${current} for this update.`;
  byId("dial-caption").textContent = dialCaption;
  renderPlayback();
  for (const [index, tile] of [...valueList.querySelectorAll(".seq-value")].entries()) {
    tile.classList.toggle("current", index === step);
    tile.classList.toggle("output", index === step + 1);
    if (tile.tagName === "BUTTON") tile.setAttribute("aria-pressed", String(index === step));
  }
  draw();
  if (announce) {
    byId("status").textContent = `Update ${step + 1}. Input ${current}. ${raw} modulo ${m} gives ${next}.`;
  }
}

function clearClock() {
  cancelAnimationFrame(frame);
  clearTimeout(hold);
}

function pause() {
  clearClock();
  playback = "paused";
  renderPlayback();
}

function land() {
  if (continuous && step < lastStep()) {
    hold = setTimeout(() => selectStep(step + 1, true), reducedMotion.matches ? 1050 : 520);
  } else {
    playback = "idle";
    renderPlayback();
  }
}

function animate() {
  if (progress === 1 || reducedMotion.matches) {
    setProgress(1);
    land();
    return;
  }
  const { a, b, m } = settings;
  const from = orbit.values[step];
  const turns = Math.abs(a * from + b - from) / m;
  const turnsPerSecond = Math.max(1, a / 2);
  const duration = Math.min(1350, 460 + 1000 * turns / turnsPerSecond);
  const started = performance.now() - progress * duration;
  function tick(now) {
    setProgress(Math.min(1, Math.max(0, (now - started) / duration)));
    if (progress < 1) frame = requestAnimationFrame(tick);
    else land();
  }
  frame = requestAnimationFrame(tick);
}

function selectStep(index, playContinuously = false) {
  clearClock();
  step = index;
  progress = reducedMotion.matches ? 1 : 0;
  playback = "running";
  continuous = playContinuously;
  renderStep(true);
  animate();
}

function renderSequence() {
  const { values, period, repeatIndex } = orbit;
  const distinct = values.length - 1;
  byId("distinct-count").textContent = distinct;
  byId("period").textContent = period;
  valueList.replaceChildren();
  values.forEach((value, index) => {
    const li = document.createElement("li");
    const repeat = index === distinct;
    const tile = document.createElement(repeat ? "span" : "button");
    tile.className = repeat ? "seq-value repeat" : "seq-value";
    tile.textContent = value;
    if (repeat) {
      tile.setAttribute("aria-label", `${value}, first repeated value`);
      tile.title = `First repeat of ${value}`;
    } else {
      tile.type = "button";
      tile.setAttribute("aria-label", `Show update ${index + 1}, from ${value} to ${values[index + 1]}`);
      tile.title = `Show update ${index + 1}`;
      tile.addEventListener("click", () => {
        document.querySelector(".linked-views").scrollIntoView({ block: "nearest", behavior: "instant" });
        selectStep(index);
      });
    }
    li.append(tile);
    valueList.append(li);
  });
  const repeated = values[distinct];
  const cycleText = distinct === 1
    ? `The seed <b>${repeated}</b> is a fixed point. Every update returns ${repeated}.`
    : repeatIndex === 0
    ? `The final <b>${repeated}</b> returns to the seed. ${period === settings.m ? `All ${period}` : `${period} of the ${settings.m}`} possible values appear before the sequence starts over.`
    : `The first ${repeatIndex === 1 ? "value occurs" : `${repeatIndex} values occur`} before the cycle begins at <b>${repeated}</b>. ${period === 1 ? `Every subsequent update returns ${repeated}.` : `From there, the same ${period} values repeat in order.`}`;
  byId("cycle-note").innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h8a4 4 0 0 1 0 8H5m3 3-3-3 3-3"/></svg><span>${cycleText}</span>`;
  if (picker.value === example.id && example.observation) {
    byId("cycle-note").lastElementChild.append(" " + example.observation);
  }
}

function renderView() {
  document.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
  byId("line-label").textContent = mode === "line" ? "Linear rule" : "Wrapped rule";
  byId("crossing-legend").hidden = mode === "wrapped";
  byId("plot-caption").textContent = mode === "line"
    ? `Follow the orange point from the input height to the line. Each ${settings.m}-unit band is one turn of the dial.`
    : `The orange point and dial hand track the same remainder. At ${settings.m}, both wrap to zero.`;
}

function renderSettings() {
  clearClock();
  playback = "idle";
  progress = 1;
  step = 0;
  picker.value = parameters.every(({ key }) => example[key] === settings[key]) ? example.id : "custom";
  for (const parameter of parameters) {
    const field = byId(parameter.key);
    const value = settings[parameter.key];
    const limit = maxFor(parameter);
    field.max = limit;
    field.value = value;
    field.title = `${parameter.name}, integer from ${parameter.min} to ${limit}`;
    field.previousElementSibling.disabled = value <= parameter.min;
    field.nextElementSibling.disabled = value >= limit;
  }
  renderView();
  renderSequence();
  renderStep();
}

function changeParameter(parameter, value, seed = settings.seed) {
  const key = parameter.key;
  if (value === settings[key]) return;
  settings[key] = value;
  if (key === "m") settings.seed = seed % value;
  orbit = getOrbit(settings);
  renderSettings();
  byId("status").textContent = `${parameter.name} ${value}. ${orbit.values.length - 1} distinct ${orbit.values.length === 2 ? "value" : "values"}. Cycle length ${orbit.period}.`;
}

function addParameter(parameter) {
  const { key, name, symbol, hint, min } = parameter;
  const row = document.createElement("div");
  row.className = "parameter";
  row.innerHTML = `<label for="${key}"><span class="symbol" aria-hidden="true">${symbol}</span><span>${name}<small id="${key}-hint" aria-hidden="true">${hint}</small></span></label>
    <div class="stepper">
      <button type="button" aria-label="Decrease ${name.toLowerCase()}">−</button>
      <input type="number" id="${key}" inputmode="numeric" step="1" min="${min}" aria-describedby="${key}-hint">
      <button type="button" aria-label="Increase ${name.toLowerCase()}">+</button>
    </div>`;
  byId("parameters").append(row);
  const field = byId(key);
  let seedAtFocus = settings.seed;
  field.previousElementSibling.addEventListener("click", () => changeParameter(parameter, settings[key] - 1));
  field.nextElementSibling.addEventListener("click", () => changeParameter(parameter, settings[key] + 1));
  field.addEventListener("focus", () => { seedAtFocus = settings.seed; });
  field.addEventListener("input", () => {
    const value = field.valueAsNumber;
    if (Number.isInteger(value) && value >= min && value <= maxFor(parameter)) {
      changeParameter(parameter, value, document.activeElement === field ? seedAtFocus : settings.seed);
    }
  });
  field.addEventListener("blur", () => {
    if (Number.isFinite(field.valueAsNumber)) {
      changeParameter(parameter, Math.max(min, Math.min(maxFor(parameter), Math.round(field.valueAsNumber))), seedAtFocus);
    }
    field.value = settings[key];
  });
  field.addEventListener("keydown", event => {
    if (event.key === "Enter") field.blur();
  });
}

function loadExample(preset) {
  example = preset;
  settings = { ...example };
  orbit = getOrbit(settings);
  renderSettings();
  byId("status").textContent = `${example.name}. ${orbit.values.length - 1} distinct values. Cycle length ${orbit.period}.`;
}

presets.forEach(({ name, id }) => picker.add(new Option(name, id)));
const custom = new Option("Custom parameters", "custom");
custom.disabled = true;
picker.add(custom);
parameters.forEach(addParameter);
picker.addEventListener("change", () => loadExample(presets.find(preset => preset.id === picker.value)));
byId("reset").addEventListener("click", () => loadExample(example));
byId("previous").addEventListener("click", () => selectStep(step - 1));
byId("next").addEventListener("click", () => selectStep(step + 1));
byId("play").addEventListener("click", () => {
  if (playback === "running") {
    pause();
  } else if (playback === "paused") {
    playback = "running";
    renderPlayback();
    animate();
  } else {
    selectStep(step === lastStep() ? 0 : step, true);
  }
});
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
  mode = button.dataset.mode;
  renderView();
  draw();
}));
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playback === "running") pause();
});
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches && progress < 1) {
    clearClock();
    setProgress(1);
    if (playback === "running") land();
  }
});

renderSettings();
let chartWidth = 0;
new ResizeObserver(([entry]) => {
  if (entry.contentRect.width !== chartWidth) {
    chartWidth = entry.contentRect.width;
    draw();
  }
}).observe(svg.parentElement);
