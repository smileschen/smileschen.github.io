"use strict";

const prior = createParameterView({
  prefix: "prior",
  title: "Prior",
  controls: byId("prior-controls"),
  initial: { alpha: 81, beta: 219 },
  onChange: refresh
});
const successes = byId("successes");
const trials = byId("trials");
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

function readCounts() {
  const x = successes.valueAsNumber;
  const n = trials.valueAsNumber;
  const validTrials = trials.validity.valid && Number.isSafeInteger(n);
  const validSuccesses = successes.validity.valid && Number.isSafeInteger(x);
  const tooManySuccesses = validTrials && validSuccesses && x > n;
  if (validTrials) trials.removeAttribute("aria-invalid");
  else trials.setAttribute("aria-invalid", "true");
  if (validSuccesses && !tooManySuccesses) successes.removeAttribute("aria-invalid");
  else successes.setAttribute("aria-invalid", "true");

  if (!validTrials || !validSuccesses || tooManySuccesses) {
    error.textContent = tooManySuccesses
      ? "Enter a success count no greater than the trial count."
      : `Enter whole numbers from 0 to ${display(Number(trials.max))} for the counts.`;
    error.hidden = false;
    return;
  }

  error.hidden = true;
  error.textContent = "";
  counts = { x, n };
  refresh();
}

const chart = byId("density-chart");
const queueDraw = connectChart(chart, curves, "θ", () => scaled ? "Density" : "Density / likelihood");

function refresh() {
  const { x, n } = counts;
  const [before, likelihood, after] = curves().map(curve => describe(curve.values));
  byId("prior-description").textContent = betaLabel(before);
  byId("likelihood-description").textContent = scaled ? betaLabel(likelihood) : `x = ${display(x)}, n = ${display(n)}`;
  byId("posterior-description").textContent = betaLabel(after);
  byId("prior-mean").textContent = display(before.mean);
  byId("posterior-mean").textContent = display(after.mean);
  byId("posterior-mode").textContent = modeLabel(after.modes, "θ");
  byId("mle").textContent = n > 0 ? display(x / n) : "Every θ in [0, 1]";
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
scaleButton.addEventListener("click", () => {
  scaled = !scaled;
  refresh();
});
refresh();
