import { getOrbit, getUpdatePath, presets } from "./generator.js?v=zero-origin";
import { drawPlot } from "./plot.js?v=zero-origin";
import { createDial } from "./dial.js?v=zero-origin";

const byId = id => document.getElementById(id);
const parameters = [
  { key: "a", name: "Multiplier", hint: "Ticks per input unit", symbol: "a", min: 0, max: 16 },
  { key: "b", name: "Increment", hint: "Ticks added each update", symbol: "b", min: 0, max: 63 },
  { key: "m", name: "Modulus", hint: "Ticks per full turn", symbol: "m", min: 2, max: 64 },
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
let travel = 0;
let landed = false;
let edge = null;
let startHoldRemaining = 0;
let edgeHoldRemaining = 0;
let playback = "ready";
let continuous = false;
let frame;
let hold;
let moveGraph;
let path;

function maxFor(parameter) {
  return parameter.max ?? settings.m - 1;
}

function lastStep() {
  return orbit.values.length - 2;
}

function position() {
  return path.pointAt(travel, edge === "right", landed);
}

function draw() {
  const point = position();
  moveGraph = drawPlot(svg, { ...settings, current: orbit.values[step], next: orbit.values[step + 1], position: point });
  drawDial(point);
}

function drawDial(point) {
  const phase = point.landed ? "landed" : travel === 0 ? "start" : "moving";
  dial.update({ m: settings.m, input: orbit.values[step], to: orbit.values[step + 1], position: point.distance, phase });
}

function setTravel(value, side = null) {
  travel = value;
  edge = side;
  landed = value === path.length && side !== "right";
  const point = position();
  moveGraph(point);
  drawDial(point);
}

function renderPlayback() {
  const running = playback === "running";
  const label = running ? "Pause" : playback === "paused" ? "Resume" : playback === "idle" && step === lastStep() ? "Replay" : "Play";
  byId("play-label").textContent = label;
  byId("play-icon").setAttribute("d", running ? "M4 3h3v12H4ZM11 3h3v12h-3Z" : "M5 3.5 14 9l-9 5.5Z");
}

function renderStep(announce = false) {
  const { a, b, m } = settings;
  const current = orbit.values[step];
  const next = orbit.values[step + 1];
  path = getUpdatePath(settings, current);
  const raw = path.total;
  byId("update-label").textContent = `Update ${step + 1} of ${lastStep() + 1}`;
  byId("calculation").innerHTML = `<span class="raw">${a} × ${current} + ${b} = ${raw}</span><span class="remainder">${raw} mod ${m} = <strong>${next}</strong></span>`;
  byId("previous").disabled = step === 0;
  byId("next").disabled = playback !== "ready" && step === lastStep();
  byId("plot-caption").textContent = `Start at 0. Count ${b} ${b === 1 ? "tick" : "ticks"} for the increment, then ${current} ${current === 1 ? "group" : "groups"} of ${a} ${a === 1 ? "tick" : "ticks"}.`;
  byId("dial-caption").textContent = raw
    ? `From 0, count ${raw} ${raw === 1 ? "tick" : "ticks"} clockwise to ${next}.`
    : "The total is 0, so the hand stays at 0.";
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
  if (landed || path.length === 0 || reducedMotion.matches) {
    setTravel(path.length);
    land();
    return;
  }
  const { a, m } = settings;
  const wraps = Math.floor(path.total / m);
  const turnsPerSecond = Math.max(1, a / 2);
  const travelTime = Math.min(1350, 460 + 1000 * path.length / m / turnsPerSecond);
  const edgeHold = 70 / Math.max(1, wraps);
  let lastFrame = performance.now();

  function advance(elapsed) {
    // Give the reset its own visible frames before counting any ticks.
    if (startHoldRemaining > 0) {
      startHoldRemaining = Math.max(0, startHoldRemaining - elapsed);
      return;
    }
    let stride = path.length * elapsed / travelTime;
    if (edge) {
      edgeHoldRemaining = Math.max(0, edgeHoldRemaining - elapsed);
      if (edgeHoldRemaining > 0) return;
      if (edge === "right") {
        // Show the same tick at each edge on separate frames, even on slow screens.
        setTravel(travel, "left");
        edgeHoldRemaining = edgeHold;
        return;
      }
    }
    if (travel === 0 || edge === "left") stride = Math.min(stride, m / 8);
    const nextTravel = Math.min(path.length, travel + stride);
    const boundary = (Math.floor(travel / m) + 1) * m;
    if (boundary <= path.total && nextTravel >= boundary) {
      setTravel(boundary, "right");
      edgeHoldRemaining = edgeHold;
    } else {
      setTravel(nextTravel);
    }
  }
  function tick(now) {
    advance(Math.max(0, now - lastFrame));
    lastFrame = now;
    if (landed) land();
    else frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
}

function selectStep(index, playContinuously = false) {
  clearClock();
  step = index;
  travel = 0;
  landed = false;
  edge = null;
  startHoldRemaining = 150;
  edgeHoldRemaining = 0;
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

function renderSettings() {
  clearClock();
  playback = "ready";
  travel = 0;
  landed = false;
  edge = null;
  startHoldRemaining = 0;
  edgeHoldRemaining = 0;
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
byId("next").addEventListener("click", () => selectStep(playback === "ready" ? 0 : step + 1));
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
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playback === "running") pause();
});
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches && playback !== "ready" && !landed) {
    clearClock();
    setTravel(path.length);
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
