"use strict";

const centerChoice = byId("center-choice");
const prior = createParameterView({
  prefix: "prior",
  title: "Prior",
  controls: byId("prior-controls"),
  initial: { alpha: 81, beta: 219 },
  center: centerChoice.querySelector("input:checked").value,
  allowMean: true,
  onChange: refresh
});
const successes = byId("successes");
const trials = byId("trials");
const proportion = byId("proportion");
const successesSlider = byId("successes-slider");
const trialsSlider = byId("trials-slider");
const proportionSlider = byId("proportion-slider");
const proportionHint = byId("proportion-hint");
const defaultProportionHint = proportionHint.textContent;
const trialSliderSpan = Number(trialsSlider.max);
const error = byId("data-error");
const scaleButton = byId("scale-likelihood");
let counts = { x: successes.valueAsNumber, n: trials.valueAsNumber };
let scaled = false;
const colors = Array.from(document.querySelectorAll("#summaries [data-series]"), element =>
  getComputedStyle(element).getPropertyValue("--series").trim()
);

function curves() {
  const { x, n } = counts;
  const { alpha, beta } = prior.values;
  return [
    { values: prior.values, color: colors[0], showModes: false },
    {
      values: { alpha: x + 1, beta: n - x + 1 },
      color: colors[1],
      dash: [8, 4],
      showMean: false,
      // Beta(x + 1, n - x + 1) integrates to one and equals (n + 1) times L.
      densityScale: scaled ? 1 : 1 / (n + 1)
    },
    {
      values: { alpha: alpha + x, beta: beta + (n - x) },
      color: colors[2],
      dash: [12, 4, 2, 4]
    }
  ];
}

function showDataError(message, fields = []) {
  for (const input of [successes, trials, proportion]) {
    if (fields.includes(input)) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
  error.textContent = message;
  error.hidden = !message;
}

function proportionText() {
  const { x, n } = counts;
  return n > 0 ? String(Number((x / n).toPrecision(8))) : "";
}

function syncCounts(edited) {
  const { x, n } = counts;
  if (edited !== successes) successes.value = x;
  if (edited !== trials) trials.value = n;
  if (edited !== proportion) proportion.value = proportionText();

  successesSlider.max = n;
  successesSlider.value = x;
  successesSlider.disabled = n === 0;
  trialsSlider.min = x;
  // Keep the range steady while dragging and expand it for a larger typed n.
  const currentMax = edited === trials ? trialSliderSpan : Number(trialsSlider.max);
  const neededMax = Math.ceil(Math.max(n, x + 1) / trialSliderSpan) * trialSliderSpan;
  trialsSlider.max = Math.min(Number(trials.max), Math.max(currentMax, neededMax));
  trialsSlider.value = n;
  trialsSlider.disabled = trialsSlider.min === trialsSlider.max;
  proportionSlider.max = n;
  proportionSlider.value = x;
  proportionSlider.setAttribute("aria-valuetext", proportionText() || "Unavailable");
  proportionSlider.disabled = n === 0;
  proportion.disabled = n === 0;
  proportionHint.textContent = n > 0 ? defaultProportionHint : "Enter at least one trial to set a proportion.";
  showDataError("");
}

function setCounts(x, n, edited) {
  counts = { x, n };
  syncCounts(edited);
  refresh();
}

function readCounts(event) {
  const x = successes.valueAsNumber;
  const n = trials.valueAsNumber;
  const validTrials = trials.validity.valid && Number.isSafeInteger(n);
  const validSuccesses = successes.validity.valid && Number.isSafeInteger(x);
  const tooManySuccesses = validTrials && validSuccesses && x > n;
  if (!validTrials || !validSuccesses || tooManySuccesses) {
    const fields = [];
    if (!validTrials) fields.push(trials);
    if (!validSuccesses || tooManySuccesses) fields.push(successes);
    const message = tooManySuccesses
      ? "Enter a success count no greater than the trial count."
      : `Enter whole numbers from 0 to ${display(Number(trials.max))} for the counts.`;
    showDataError(message, fields);
    return;
  }

  setCounts(x, n, event.target);
}

function setProportion(rate, edited) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    showDataError("Enter a proportion between 0 and 1.", [proportion]);
    return;
  }
  const n = trials.valueAsNumber;
  if (!trials.validity.valid || !Number.isSafeInteger(n) || n === 0) {
    proportionSlider.value = counts.x;
    showDataError("Enter a positive whole number of trials to set a proportion.", [proportion]);
    return;
  }
  setCounts(Math.round(rate * n), n, edited);
}

const chart = byId("density-chart");
const queueDraw = connectChart(chart, curves, "θ", () => scaled ? "Density" : "Density / likelihood");

function refresh() {
  const { x, n } = counts;
  const [before, likelihood, after] = curves().map(curve => describe(curve.values));
  byId("prior-description").textContent = betaLabel(before);
  byId("likelihood-description").textContent = scaled ? betaLabel(likelihood) : `x = ${display(x)}, n = ${display(n)}`;
  byId("posterior-description").textContent = betaLabel(after);
  byId("prior-mean-summary").textContent = display(before.mean);
  byId("posterior-mean").textContent = display(after.mean);
  byId("posterior-mode").textContent = modeLabel(after.modes, "θ");
  byId("mle").textContent = proportionText() || "Every θ in [0, 1]";
  showBoundary(byId("prior-boundary"), before.poles, "θ");
  showBoundary(byId("posterior-boundary"), after.poles, "θ");
  scaleButton.setAttribute("aria-pressed", String(scaled));
  byId("scale-note").textContent = scaled
    ? `Scaled by n + 1 = ${display(n + 1)} for unit area.`
    : "Scaling multiplies the likelihood by n + 1 to give it unit area.";
  chart.setAttribute("aria-label", scaled
    ? "Beta prior, scaled likelihood density, and Beta posterior"
    : "Beta prior, binomial likelihood, and Beta posterior");
  queueDraw();
}

successes.addEventListener("input", readCounts);
trials.addEventListener("input", readCounts);
successesSlider.addEventListener("input", () => setCounts(successesSlider.valueAsNumber, counts.n));
trialsSlider.addEventListener("input", () => setCounts(counts.x, trialsSlider.valueAsNumber));
proportionSlider.addEventListener("input", () => {
  setProportion(proportionSlider.valueAsNumber / Number(proportionSlider.max));
});
proportion.addEventListener("input", () => setProportion(proportion.valueAsNumber, proportion));
proportion.addEventListener("change", () => {
  if (proportion.getAttribute("aria-invalid") !== "true") proportion.value = proportionText();
});
centerChoice.addEventListener("change", event => {
  prior.center = event.target.value;
  syncControls(prior);
});
scaleButton.addEventListener("click", () => {
  scaled = !scaled;
  refresh();
});
syncCounts();
refresh();
