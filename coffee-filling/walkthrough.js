"use strict";

const { target, data, generation, fits, learning, steps, chain, warmup } = coffeeData;
const names = Object.keys(data);
const coordinates = [...names, "Line"];
const chosenMachine = "B";
const simulatedBags = generation.bags[chosenMachine].slice(0, 4);
const bagTotal = names.reduce((total, name) => total + data[name].length, 0);
const generationEnd = 1 + names.length + simulatedBags.length;
const sweepCount = steps.at(-1).sweep;
const indices = { generate: 0, learn: 0, gibbs: 0 };
const compact = window.matchMedia("(max-width: 600px)");
const get = (id) => document.getElementById(id);
const width = () => compact.matches ? 340 : 620;

function offset(value, digits = 2) {
  const rounded = Number(value.toFixed(digits));
  const sign = rounded < 0 ? "−" : rounded > 0 ? "+" : "";
  return sign + Math.abs(rounded).toFixed(digits);
}

const grams = (value) => `${offset(value)} g`;
const fillWeight = (deviation) => `${(target + deviation).toFixed(2)} g`;
const normal = (x, mean, sd) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
const svg = (body, height, description, plotWidth = width()) =>
  `<svg class="chart" viewBox="0 0 ${plotWidth} ${height}" role="img" aria-label="${description}">${body}</svg>`;
const line = (x1, y1, x2, y2, style) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${style}"/>`;
const mark = (x, y, style, radius = 5.5) =>
  `<circle cx="${x}" cy="${y}" r="${radius}" class="${style}"/>`;
const diamond = (x, y) =>
  `<polygon points="${x},${y - 6} ${x + 6},${y} ${x},${y + 6} ${x - 6},${y}" class="posterior-mark"/>`;
const label = (x, y, text, anchor = "start", style = "") =>
  `<text x="${x}" y="${y}" class="${style}" text-anchor="${anchor}">${text}</text>`;

function scale(min, max, left = 48, right = width() - 16) {
  const x = (value) => left + (right - left) * (value - min) / (max - min);
  return { min, max, left, right, x };
}

function offsetAxis(values, step) {
  const min = step * Math.floor(Math.min(0, ...values) / step);
  const max = Math.max(min + step, step * Math.ceil(Math.max(0, ...values) / step));
  const ticks = Array.from({ length: 1 + (max - min) / step }, (_, i) => min + i * step);
  return { min, max, ticks };
}

const credibleZ = 1.95996398454;
const inferenceAxis = offsetAxis([
  ...Object.values(data).flat(),
  ...fits.flatMap((fit) => [fit.line, ...Object.values(fit.machines)].flatMap(({ mean, sd }) =>
    [mean - credibleZ * sd, mean + credibleZ * sd])),
], 4);
const curveAxis = offsetAxis([
  ...Object.values(data).flat(),
  ...[learning.a_prior, learning.a_prior_with_b, learning.b_prior_with_a]
    .flatMap(({ mean, sd }) => [mean - 3.3 * sd, mean + 3.3 * sd]),
], 5);
const conditionalAxis = offsetAxis([
  ...chain,
  ...steps.map((step) => step.draw),
  ...[fits.at(-1).line, ...steps].flatMap(({ mean, sd }) => [mean - 3.5 * sd, mean + 3.5 * sd]),
], 4);
const traceAxis = offsetAxis(steps.filter((step) => step.coordinate === "Line").map((step) => step.draw), 2);

function horizontalAxis(sc, y, ticks, fillAxisLabel) {
  const tickMarks = ticks.map((value) => {
    const at = sc.x(value);
    const tickLabel = fillAxisLabel ? target + value : offset(value, 0);
    return line(at, y, at, y + 5, "axis") + label(at, y + 21, tickLabel, "middle");
  }).join("");
  const axisTitle = fillAxisLabel ?? `Fill deviation from ${target} g (g)`;
  return line(sc.left, y, sc.right, y, "axis") + tickMarks
    + label((sc.left + sc.right) / 2, y + 42, axisTitle, "middle");
}

function densityPath(sc, y, mean, sd) {
  const samples = Array.from({ length: 121 }, (_, i) => sc.min + (sc.max - sc.min) * i / 120);
  return samples.map((value, i) =>
    `${i === 0 ? "M" : "L"} ${sc.x(value).toFixed(2)} ${y(normal(value, mean, sd)).toFixed(2)}`
  ).join(" ");
}

function legend(items) {
  return `<p class="legend">${items.map(([style, text]) =>
    `<span><i class="symbol ${style}" aria-hidden="true">${style === "previous" ? "×" : ""}</i>${text}</span>`
  ).join("")}</p>`;
}

const scene = (plot, side, below = "") =>
  `<div class="lesson-grid"><section class="chart-card">${plot}</section><section class="side-card">${side}</section></div>${below}`;

function generationPlot(hasLine, machineCount, bagCount) {
  const sc = scale(-12, 17, 62);
  const baseline = 94;
  const y = (density) => baseline - 660 * density;
  const path = densityPath(sc, y, 0, 4);
  let body = `<path d="${path} L ${sc.right} ${baseline} L ${sc.left} ${baseline} Z" class="shade"/>
    <path d="${path}" class="curve"/>`;
  body += label(sc.left, 17, "Hyperprior for the line offset", "start", "chart-label");
  body += line(sc.left, baseline, sc.right, baseline, "axis");
  if (hasLine) body += mark(sc.x(generation.line), y(normal(generation.line, 0, 4)), "draw-mark", 7);
  const bagRow = `${chosenMachine} bags`;
  ["Line", ...names, bagRow].forEach((name, i) => {
    const row = 121 + 43 * i;
    body += label(2, row - 1, name, "start", "chart-label") + line(sc.left, row, sc.right, row, "gridline");
    if (i === 0 && hasLine) body += mark(sc.x(generation.line), row, "draw-mark");
    if (i >= 1 && i <= machineCount) {
      const mean = generation.machines[name];
      const bagSd = 4;
      const machineY = (density) => row - 295 * density;
      const machinePath = densityPath(sc, machineY, mean, bagSd);
      body += `<path d="${machinePath} L ${sc.right} ${row} L ${sc.left} ${row} Z" class="shade"/>`;
      body += `<path d="${machinePath}" class="machine-curve"/>`;
      body += mark(sc.x(mean), machineY(normal(mean, mean, bagSd)), "posterior-mark", 5);
    }
    if (name === bagRow && bagCount) {
      const bMean = sc.x(generation.machines[chosenMachine]);
      body += line(bMean, row - 15, bMean, row + 10, "mean-mark");
      body += simulatedBags.slice(0, bagCount).map((v) => mark(sc.x(v), row, "observed-mark", 4.5)).join("");
    }
  });
  body += horizontalAxis(sc, 355, [-10, -5, 0, 5, 10, 15]);
  const description = hasLine ?
    `Simulated line offset ${grams(generation.line)}. ${machineCount} machine means with Normal curves for that machine’s bag weights and ${bagCount} simulated bag weights from machine ${chosenMachine} are visible.` :
    "Normal hyperprior for the line offset, centered at zero with standard deviation four grams.";
  return svg(body, 405, description);
}

function generationView(index) {
  const hasLine = index >= 1;
  const machineCount = Math.min(names.length, Math.max(0, index - 1));
  const bagCount = Math.max(0, index - 1 - names.length);
  const complete = index === generationEnd;
  let title = "Start with the hyperprior";
  let cue = `The hyperprior describes plausible values of the whole line’s average offset before we have weighed any bags. It’s centered at 0 g, which corresponds to the ${target} g label, with a standard deviation of 4 g.`;
  let next = "Draw the line offset";
  if (hasLine) {
    title = "One draw sets the line’s center";
    cue = `This simulated line’s offset is ${grams(generation.line)}. Its population of machine means is centered at ${fillWeight(generation.line)}. Draw the four machine means around that shared center with a standard deviation of 2 g.`;
    next = machineCount < names.length ? `Draw machine ${names[machineCount]}’s offset` :
      `Draw the first bag from ${chosenMachine}`;
  }
  if (machineCount > 0) {
    const last = names[machineCount - 1];
    title = `Machine ${last} gets its own center`;
    const mean = generation.machines[last];
    cue = `Machine ${last}’s long-run average fill is ${fillWeight(mean)}, or ${grams(mean)} relative to the label. Its green dot marks that average. The small Normal curve shows how bags from this machine vary around it, with a standard deviation of 4 g.`;
  }
  if (bagCount > 0) {
    title = `Bag ${bagCount} from machine ${chosenMachine}`;
    const deviation = simulatedBags[bagCount - 1];
    const mean = generation.machines[chosenMachine];
    const comparison = deviation < mean ? "below" : "above";
    cue = `This bag weighs ${fillWeight(deviation)}, ${Math.abs(deviation - mean).toFixed(2)} g ${comparison} machine ${chosenMachine}’s average of ${fillWeight(mean)}. Every bag from ${chosenMachine} is drawn from the same Normal curve.`;
    next = complete ? `Review all ${bagTotal} weighed bags` : "Draw the next bag";
  }
  if (complete) {
    cue = "We’ll keep these four weights in the data we analyze. Both of A’s weights and the last of B’s weights were chosen so the two machines share a sample mean of 255 g.";
  }
  const waiting = '<span class="waiting">awaiting draw</span>';
  const bagItems = simulatedBags.slice(0, bagCount).map((v, i) =>
    `<li>Bag ${i + 1} <strong>${fillWeight(v)}</strong> (${grams(v)} from target)</li>`
  ).join("");
  const machineItems = names.map((name, i) => `<li><strong>Machine ${name}</strong>
    ${i < machineCount ? `${fillWeight(generation.machines[name])} average (${grams(generation.machines[name])} from target)` : waiting}
    ${name === chosenMachine && bagItems ? `<ul>${bagItems}</ul>` : ""}</li>`).join("");
  const tree = `<ul class="tree"><li><strong>Line offset</strong> ${hasLine ? `${grams(generation.line)}, shared center ${fillWeight(generation.line)}` : waiting}
    <ul>${machineItems}</ul></li></ul>`;
  const plot = `<h3>From the line to the bags</h3>
    ${legend([["draw", "Line mean"], ["posterior", "Machine mean"], ["open", "Bag weight"]])}
    ${generationPlot(hasLine, machineCount, bagCount)}
    ${machineCount ? '<p class="chart-note">Each small curve shows how bag weights vary around that machine’s mean. The standard deviation is 4 g for each machine.</p>' : ""}
    ${bagCount ? `<p class="chart-note">The dashed mark on the bag row shows machine ${chosenMachine}’s mean.</p>` : ""}`;
  return {
    progress: `Simulated production line · Step ${index + 1} of ${generationEnd + 1}`,
    title, cue, next,
    html: scene(plot, `<h3>Simulated values</h3><p>Draw the line once, each machine once, and each bag separately.</p>${tree}`),
  };
}

function observedRecords(available) {
  const records = names.map((name) => {
    if (!available.includes(name)) {
      return `<div><h4>Machine ${name}</h4><p class="line-record">Awaiting bags</p></div>`;
    }
    const bags = data[name].map((v) => `<li>${fillWeight(v)}</li>`).join("");
    const observed = fits.at(-1).machines[name].observed;
    return `<div><h4>Machine ${name} · ${data[name].length} bags</h4>
      <p class="line-record">Sample mean <span class="record-weight">${fillWeight(observed)}</span></p>
      <ul class="record-list">${bags}</ul></div>`;
  }).join("");
  return `<section class="data-card"><h3>Weighed bags from this teaching example</h3>
    <p class="chart-note">Both of A’s weights and the last of B’s weights were chosen so A and B share a sample mean of 255 g.</p>
    <div class="record-grid">${records}</div></section>`;
}

function bagTick(sc, deviation, top, bottom) {
  const x = sc.x(deviation);
  return `<g><title>Bag weight ${fillWeight(deviation)}</title>${line(x, top, x, bottom, "bag-tick")}</g>`;
}

function bellPlot(rows, description) {
  const { min, max, ticks } = curveAxis;
  const sc = scale(min, max, 30, width() - 22);
  const maxDensity = Math.max(...rows.flatMap(({ curves }) =>
    curves.map(({ mean, sd }) => normal(mean, mean, sd))));
  const start = 87;
  const gap = 105;
  const axisY = start + gap * (rows.length - 1) + 26;
  let body = line(sc.x(0), 26, sc.x(0), axisY, "target");
  rows.forEach(({ title, curves, bags = [] }, i) => {
    const base = start + gap * i;
    const y = (density) => base - 62 * density / maxDensity;
    body += label(sc.left, base - 70, title, "start", "chart-label");
    body += line(sc.left, base, sc.right, base, "gridline");
    for (const { mean, sd, style, meanLabel } of curves) {
      const x = sc.x(mean);
      const path = densityPath(sc, y, mean, sd);
      const peak = y(normal(mean, mean, sd));
      body += `<path d="${path}" class="bayes-${style}"/>`;
      if (style === "posterior") {
        body += `<g><title>${meanLabel ?? "Posterior mean"} ${fillWeight(mean)}</title>${diamond(x, peak)}</g>`;
      } else if (style === "likelihood") {
        body += `<g><title>Sample mean ${fillWeight(mean)}</title>${mark(x, peak, "observed-mark", 5)}</g>`;
      } else {
        body += mark(x, peak, "prior-mean", 4);
      }
    }
    body += bags.map((weight) => bagTick(sc, weight, base + 2, base + 13)).join("");
  });
  body += horizontalAxis(sc, axisY, ticks, "Long-run mean fill (g)");
  return svg(body, axisY + 44, description);
}

function estimateList(values) {
  return `<dl class="readout">${values.map(([name, value]) =>
    `<div><dt>${name}</dt><dd><strong>${fillWeight(value)}</strong></dd></div>`).join("")}</dl>`;
}

function aPriorView() {
  const prior = learning.a_prior;
  const plot = `<h3>Prior for A’s long-run mean</h3>
    ${bellPlot([{ title: "Before any bags", curves: [{ ...prior, style: "prior" }] }],
    "The Normal prior for machine A is centered at 250 grams with standard deviation 4.47 grams.")}`;
  const side = `<h3>Where the prior comes from</h3>
    <p>Before weighing any bags, we center the line at ${target} g. The prior for A’s mean combines uncertainty about the line (SD 4 g) with variation across machines (SD 2 g).</p>
    ${estimateList([["A’s prior mean", prior.mean]])}`;
  return {
    title: "Start before any bags are weighed",
    cue: "Set aside the machine and line means used to simulate the data. Start with the prior for A’s unknown long-run average.",
    html: scene(plot, side),
  };
}

function machineUpdateView(name, prior, fit, available) {
  const likelihood = learning.likelihoods[name];
  const posterior = fit.machines[name];
  const isA = name === "A";
  const priorLabel = isA ? "Prior before any bags" : "Prior using A’s bags";
  const rows = [
    { title: priorLabel, curves: [{ ...prior, style: "prior" }] },
    { title: "Scaled likelihood", curves: [{ ...likelihood, style: "likelihood" }], bags: data[name] },
    { title: "Posterior", curves: [{ ...posterior, style: "posterior" }] },
  ];
  const plot = `<h3>Machine ${name}’s mean</h3>
    ${legend([["bag-tick", "Individual bag"], ["open", "Sample mean"], ["posterior-diamond", "Posterior mean"]])}
    ${bellPlot(rows, `${priorLabel} centers at ${fillWeight(prior.mean)}. The likelihood peaks at the sample mean of ${fillWeight(likelihood.mean)}. The posterior is centered at ${fillWeight(posterior.mean)}.`)}
    <p class="chart-note">The likelihood is scaled to have area 1 so its shape can be compared with the prior and posterior.</p>`;
  const side = `<h3>Prior × likelihood</h3>
    <p>${isA ? "The likelihood peaks at A’s two-bag average. Multiply it by the prior and rescale the result to obtain the posterior." : "A’s two bags update the shared line mean, which centers the prior for B. B’s eight bags supply the likelihood for B."}</p>
    ${estimateList([["Prior center", prior.mean], ["Sample mean", likelihood.mean], ["Posterior mean", posterior.mean]])}`;
  return {
    title: isA ? "Update A with its two bags" : "Update B with its eight bags",
    cue: isA
      ? `A’s sample mean is ${fillWeight(likelihood.mean)}. Combining the likelihood and prior moves the center to ${fillWeight(posterior.mean)} and narrows the distribution.`
      : `A and B have the same sample mean of ${fillWeight(likelihood.mean)}. See how the prior informed by A combines with B’s own data.`,
    html: scene(plot, side, observedRecords(available)),
  };
}

function bUpdatesAView() {
  const prior = learning.a_prior;
  const updated = learning.a_prior_with_b;
  const aOnly = learning.a_only.machines.A;
  const aAndB = fits[0].machines.A;
  const rows = [
    { title: "Prior for A", curves: [{ ...prior, style: "prior" },
      { ...updated, style: "posterior", meanLabel: "Prior mean using B’s bags" }] },
    { title: "Posterior for A", curves: [{ ...aOnly, style: "prior" }, { ...aAndB, style: "posterior" }] },
  ];
  const plot = `<h3>How B’s bags change A’s estimate</h3>
    ${legend([["dashed", "Before B’s bags"], ["solid", "With B’s bags"]])}
    ${bellPlot(rows, `B’s data shift A’s prior mean from ${fillWeight(prior.mean)} to ${fillWeight(updated.mean)}. With A’s own likelihood, the posterior mean shifts from ${fillWeight(aOnly.mean)} to ${fillWeight(aAndB.mean)}.`)}`;
  const side = `<h3>A’s data enter once</h3>
    <p>To see B’s effect, build A’s updated prior using B’s bags alone. Then combine it with the same likelihood from A’s two bags to get the posterior based on both machines.</p>
    ${estimateList([["A’s prior before any bags", prior.mean], ["A’s prior using only B’s bags", updated.mean],
    ["A’s posterior using only A’s bags", aOnly.mean],
    ["A’s posterior using A and B’s bags", aAndB.mean]])}`;
  return {
    title: "B’s data also update A",
    cue: `B’s bags update the shared line mean. That lifts A’s prior center and moves A’s posterior mean from ${fillWeight(aOnly.mean)} to ${fillWeight(aAndB.mean)}.`,
    html: scene(plot, side, observedRecords(names.slice(0, 2))),
  };
}

function inferencePlot(fit, previous) {
  const { min, max, ticks } = inferenceAxis;
  const sc = scale(min, max, 49);
  const firstRow = 32;
  const rowSpacing = 53;
  const axisY = firstRow + (coordinates.length - 1) * rowSpacing + 31;
  let body = line(sc.x(0), 8, sc.x(0), axisY, "target");
  coordinates.forEach((name, i) => {
    const row = firstRow + i * rowSpacing;
    const isLine = name === "Line";
    const record = isLine ? fit.line : fit.machines[name];
    body += label(2, row + 5, name, "start", "chart-label") + line(sc.left, row, sc.right, row, "gridline");
    if (!record) {
      body += label(sc.left + 8, row - 6, "Awaiting bags");
      return;
    }
    const midpoint = sc.x(record.mean);
    const left = sc.x(record.mean - credibleZ * record.sd);
    const right = sc.x(record.mean + credibleZ * record.sd);
    const postY = row + 13;
    body += line(left, postY, right, postY, "interval") + line(left, postY - 4, left, postY + 4, "interval")
      + line(right, postY - 4, right, postY + 4, "interval")
      + `<g><title>Posterior mean ${fillWeight(record.mean)}</title>${diamond(midpoint, postY)}</g>`;
    if (!isLine) {
      const weights = data[name].map((deviation) => bagTick(sc, deviation, row - 21, row - 9)).join("");
      body += weights + `<g><title>Sample mean ${fillWeight(record.observed)}</title>${mark(sc.x(record.observed), row, "observed-mark")}</g>`;
    }
    if (name === "A" && previous) {
      const old = sc.x(previous.machines.A.mean);
      const previousY = row + 24;
      body += line(old - 3, previousY - 3, old + 3, previousY + 3, "compare-mark")
        + line(old + 3, previousY - 3, old - 3, previousY + 3, "compare-mark");
    }
  });
  body += horizontalAxis(sc, axisY, ticks, "Fill weight (g)");
  const estimates = Object.entries(fit.machines)
    .map(([name, record]) => `Machine ${name} ${fillWeight(record.mean)}`).join(", ");
  return svg(body, axisY + 49, `Vertical ticks mark individual bag weights, open circles mark sample means, and solid diamonds mark posterior means with 95 percent credible intervals. Posterior mean fills are ${estimates}, line ${fillWeight(fit.line.mean)}.`);
}

function revealView(index) {
  const fit = fits[index];
  const previous = fits[index - 1];
  const complete = index === fits.length - 1;
  const introduced = names[1 + index];
  let cue = `The new ticks show the bags from ${introduced}. Through the shared line mean, they move A’s posterior mean from ${fillWeight(previous.machines.A.mean)} to ${fillWeight(fit.machines.A.mean)}.`;
  if (complete) cue += " A and B’s sample means match. B’s eight bags give it a narrower credible interval.";
  const legendItems = [["bag-tick", "Individual bag"], ["open", "Sample mean"],
    ["posterior-diamond", "Posterior mean and 95% credible interval"], ["previous", "Previous estimate for A"]];
  const plot = `<h3>Machine and line estimates</h3>${legend(legendItems)}
    ${inferencePlot(fit, previous)}<p class="chart-note">A machine’s interval describes its long-run mean fill.</p>`;
  const readout = [
    ["Line mean", fit.line.mean],
    ["Machine A mean", fit.machines.A.mean],
    ["Machine B mean", fit.machines.B.mean],
  ].map(([name, estimate]) => `<div><dt>${name}</dt><dd><strong>${(target + estimate).toFixed(2)} g</strong> (${grams(estimate)} from target)</dd></div>`).join("");
  const side = `<h3>Estimated long-run fills</h3><p>The exact posterior combines the bag records with the Normal hierarchy.</p>
    <dl class="readout">${readout}</dl>`;
  return {
    title: `Add ${introduced}’s bags`,
    cue,
    html: scene(plot, side, observedRecords(Object.keys(fit.machines))),
  };
}

const learningStages = [
  { render: aPriorView, next: "Weigh A’s two bags" },
  { render: () => machineUpdateView("A", learning.a_prior, learning.a_only, ["A"]), next: "Weigh B’s eight bags" },
  { render: () => machineUpdateView("B", learning.b_prior_with_a, fits[0], ["A", "B"]), next: "See how B updates A" },
  { render: bUpdatesAView, next: "Weigh bags from C" },
  { render: () => revealView(1), next: "Weigh bags from D" },
  { render: () => revealView(2), next: "Continue to Gibbs sampling" },
];

function inferenceView(index) {
  const stage = learningStages[index];
  return {
    ...stage.render(),
    progress: `Learn from weighed bags · Step ${index + 1} of ${learningStages.length}`,
    next: stage.next,
  };
}

function gibbsDensity({ mean, sd, draw, samples }) {
  const { min, max, ticks } = conditionalAxis;
  const sc = scale(min, max);
  const baseline = 177;
  const y = (density) => baseline - 350 * density;
  let body = [0, 0.2, 0.4].map((density) => line(sc.left, y(density), sc.right, y(density), "gridline")
    + label(sc.left - 8, y(density) + 5, density.toFixed(1), "end")).join("");
  body += label(2, 18, "Density", "start", "chart-label");
  body += horizontalAxis(sc, baseline, ticks);
  const path = densityPath(sc, y, mean, sd);
  if (samples) {
    const binWidth = .5;
    const counts = Array((sc.max - sc.min) / binWidth).fill(0);
    samples.forEach((value) => {
      const bin = Math.floor((value - sc.min) / binWidth);
      if (bin >= 0 && bin < counts.length) counts[bin] += 1;
    });
    body += counts.map((count, i) => {
      const at = sc.min + binWidth * i;
      const top = y(count / (samples.length * binWidth));
      return `<rect x="${sc.x(at)}" y="${top}" width="${sc.x(at + binWidth) - sc.x(at)}" height="${baseline - top}" class="histogram"/>`;
    }).join("");
  } else {
    body += `<path d="${path} L ${sc.right} ${baseline} L ${sc.left} ${baseline} Z" class="shade"/>`;
  }
  body += `<path d="${path}" class="curve"/>`;
  if (!samples) {
    body += line(sc.x(mean), y(normal(mean, mean, sd)), sc.x(mean), baseline, "mean-mark");
    body += mark(sc.x(draw), y(normal(draw, mean, sd)), "draw-mark", 7);
  }
  const description = samples ?
    `Histogram of ${samples.length} line draws and the exact marginal posterior with mean ${grams(mean)} and standard deviation ${sd.toFixed(2)} grams.` :
    `Normal full conditional with center ${grams(mean)} and standard deviation ${sd.toFixed(2)} grams. The random draw is ${grams(draw)}.`;
  return svg(body, 226, description);
}

function tracePlot(saved) {
  const height = 127;
  const plotWidth = 340;
  const sc = scale(1, sweepCount, 48, plotWidth - 16);
  const bottom = 86;
  const { min, max, ticks } = traceAxis;
  const y = (value) => bottom - 68 * (value - min) / (max - min);
  const sweeps = Array.from({ length: sweepCount }, (_, i) => i + 1);
  let body = line(sc.left, bottom, sc.right, bottom, "axis");
  body += ticks.map((tick) => line(sc.left, y(tick), sc.right, y(tick), tick ? "gridline" : "target")
    + label(sc.left - 8, y(tick) + 5, `${offset(tick, 0)} g`, "end")).join("");
  body += sweeps.map((i) => line(sc.x(i), bottom, sc.x(i), bottom + 5, "axis")
    + label(sc.x(i), bottom + 21, i, "middle")).join("");
  body += label((sc.left + sc.right) / 2, height, "Completed sweep", "middle");
  body += saved.map((step, i) => {
    const x = sc.x(step.sweep);
    const at = y(step.draw);
    const prev = saved[i - 1];
    return (prev ? line(sc.x(prev.sweep), y(prev.draw), x, at, "interval") : "")
      + mark(x, at, "draw-mark", 5.5);
  }).join("");
  const values = saved.map((v) => `sweep ${v.sweep} ${grams(v.draw)}`).join(", ");
  return svg(body, height + 5, `Saved line draws by sweep. ${values}.`, plotWidth);
}

function stateTable(step) {
  const baseline = steps[0].before;
  const before = step ? step.before : baseline;
  const after = step ? step.after : baseline;
  const lineUpdate = step?.coordinate === "Line";
  const rows = coordinates.map((name) => {
    const used = step && (lineUpdate ? name !== "Line" : name === "Line");
    const drawn = step?.coordinate === name;
    const rowLabel = name === "Line" ? "Line" : `Machine ${name}`;
    return `<tr><th scope="row">${rowLabel}</th>
     <td class="${used ? "state-input" : ""}">${offset(before[name])}${used ? " (used)" : ""}</td>
     <td class="${drawn ? "state-drawn" : ""}">${offset(after[name])}${drawn ? " (drawn)" : ""}</td></tr>`;
  }).join("");
  return `<table><caption>Gibbs state (g from target)</caption>
    <thead><tr><th scope="col">Offset</th><th scope="col">Before</th><th scope="col">Current</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function weighedBagsPlot() {
  const { min, max, ticks } = offsetAxis(Object.values(data).flat(), 4);
  const sc = scale(min, max, 42);
  const axisY = 167;
  let body = line(sc.x(0), 12, sc.x(0), axisY, "target");
  names.forEach((name, i) => {
    const row = 24 + 38 * i;
    body += label(2, row + 5, name, "start", "chart-label") + line(sc.left, row, sc.right, row, "gridline");
    body += data[name].map((value) =>
      `<g><title>Machine ${name}, ${fillWeight(value)}</title>${mark(sc.x(value), row, "observed-mark", 4)}</g>`).join("");
  });
  body += horizontalAxis(sc, axisY, ticks);
  return svg(body, axisY + 49, `Dot plot of ${bagTotal} observed bag weights by machine. Each dot is one bag.`);
}

function aDistributionLesson() {
  return {
    cue: "At the current line offset of 0 g, A’s starting distribution has mean 0 and variance 4. A’s two-bag likelihood is centered at +5 g with variance 8.",
    plot: `<h3>Multiply the two Normal terms</h3>
      <p>Precision is reciprocal variance. Multiplying the prior by the likelihood adds two squared terms in the exponent. After factoring out −½, those terms are</p>
      <p class="equation">(θ<sub>A</sub> − 0)²/4 + (θ<sub>A</sub> − 5)²/8.</p>
      <p>Expand this sum and match the coefficients with those of (θ<sub>A</sub> − M<sub>A</sub>)²/V<sub>A</sub>. The coefficient of θ<sub>A</sub>² gives the conditional precision. Divide the coefficient of θ<sub>A</sub> by −2 to get the conditional mean times that precision.</p>
      <p class="equation">1/V<sub>A</sub> = 1/4 + 1/8<br>M<sub>A</sub>/V<sub>A</sub> = 0/4 + 5/8.</p>`,
  };
}

function machineCalculationLesson(name, meanFraction, varianceFraction) {
  const priorVariance = 4;
  const bagVariance = 16;
  const count = data[name].length;
  const { mean } = learning.likelihoods[name];
  const samplingVariance = bagVariance / count;
  return {
    cue: `The line offset is still 0 g. Machine ${name}’s ${count} bags average ${fillWeight(mean)}, or ${grams(mean)} relative to target.`,
    plot: `<h3>Weight by precision</h3>
      <p>The variance around the line is ${priorVariance} g², giving prior precision 1/${priorVariance}. The bag average has sampling variance ${bagVariance}/${count} = ${samplingVariance} g², giving precision 1/${samplingVariance}.</p>
      <p class="equation">V<sub>${name}</sub> = (1/${priorVariance} + 1/${samplingVariance})<sup>−1</sup> = ${varianceFraction}<br>
      M<sub>${name}</sub> = V<sub>${name}</sub>(0/${priorVariance} + ${mean}/${samplingVariance}) = ${meanFraction}</p>
      <p>The conditional distribution is <strong>N(${meanFraction}, ${varianceFraction})</strong>, with mean first and variance second.</p>`,
  };
}

function lineCalculationLesson() {
  const update = steps[4];
  const inputs = names.map((name) => offset(update.before[name])).join(", ");
  return {
    cue: `Hold the four machine draws fixed at ${inputs} g. Each tells us something about the line offset they share.`,
    plot: `<h3>Combine the line prior and the machine draws</h3>
      <p>The line prior N(0, 16) contributes precision 1/16. Each machine offset has variance 4 g² around the line, so each of the four contributes precision 1/4.</p>
      <p class="equation">V = (1/16 + 4 × 1/4)<sup>−1</sup> = 16/17<br>
      M = (4/17)(θ<sub>A</sub> + θ<sub>B</sub> + θ<sub>C</sub> + θ<sub>D</sub>) ≈ ${grams(update.mean)}</p>
      <p>Draw the line offset from N(M, 16/17). This draw supplies the current line offset for the next sweep.</p>`,
  };
}

const explanations = {
  1: [
    { title: "Where did A’s distribution come from?", render: aDistributionLesson },
    { title: "Calculate A’s conditional distribution", render: () => machineCalculationLesson("A", "5/3", "8/3") },
    { title: "Calculate B’s conditional distribution", render: () => machineCalculationLesson("B", "10/3", "4/3") },
  ],
  4: [{ title: "Calculate the shared line’s conditional distribution", render: lineCalculationLesson }],
};
const gibbsStages = [
  { draws: 0 },
  ...steps.flatMap((_, index) => {
    const draws = index + 1;
    return [{ draws }, ...(explanations[draws] || []).map((lesson) => ({ draws, lesson }))];
  }),
  { draws: steps.length, longRun: true },
];

function gibbsView(index) {
  const { draws, lesson, longRun } = gibbsStages[index];
  const step = steps[draws - 1];
  const nextStep = steps[draws];
  const nextLesson = gibbsStages[index + 1]?.lesson;
  const saved = steps.slice(0, draws).filter((entry) => entry.coordinate === "Line");
  const complete = saved.length === sweepCount;
  const progress = step ? `Sweep ${step.sweep} of ${sweepCount} · Update ${(draws - 1) % coordinates.length + 1} of ${coordinates.length}`
    : `${sweepCount} sweeps · Ready to start`;
  let title = `The ${bagTotal} weighed bags`;
  let cue = "Keep these observations fixed and start all five offsets at 0 g. A draws first, using the current line offset and its two bags.";
  let plot = `<h3>One dot per weighed bag</h3>${weighedBagsPlot()}`;
  if (lesson) {
    title = lesson.title;
    ({ cue, plot } = lesson.render());
  } else if (step && !longRun) {
    const lineUpdate = step.coordinate === "Line";
    title = lineUpdate ? "Draw the line offset" : `Draw machine ${step.coordinate}’s offset`;
    if (lineUpdate) {
      const save = complete ? "Save this line draw with the completed fourth sweep." :
        `Save this line draw and carry ${grams(step.draw)} forward to sweep ${step.sweep + 1}.`;
      cue = `Use the four machine offsets drawn in sweep ${step.sweep}. ${save}`;
    } else {
      const fromPrevious = step.sweep > 1 && step.coordinate === "A" ? " from the previous sweep" : "";
      cue = `Use ${grams(step.before.Line)} for the line${fromPrevious} and machine ${step.coordinate}’s ${data[step.coordinate].length} observed bags to center this Normal distribution.`;
      if (draws === 1) {
        cue = `With the line at 0 g and A’s bags weighing ${data.A.map((value) => target + value).join(" and ")} g, draw A’s offset from N(5/3, 8/3). This draw is ${grams(step.draw)}. Keep it for the line update.`;
      }
    }
    plot = `<h3>Full conditional for ${lineUpdate ? "the line" : `machine ${step.coordinate}`}</h3>
      ${legend([["center", "Conditional center"], ["draw", "Random draw"]])}
      ${gibbsDensity(step)}
      <p class="chart-note">Center ${grams(step.mean)} · SD ${step.sd.toFixed(2)} g · Draw ${grams(step.draw)}</p>`;
  }
  if (longRun) {
    const exact = fits.at(-1).line;
    const mean = chain.reduce((sum, value) => sum + value, 0) / chain.length;
    const sd = Math.sqrt(chain.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (chain.length - 1));
    const count = chain.length.toLocaleString("en-US");
    title = "Many sweeps approximate the posterior";
    cue = `Compare ${count} sampled line offsets after ${warmup} warm-up sweeps with the exact posterior for the same ${bagTotal} bags.`;
    plot = `<h3>Marginal posterior for the line</h3>
      ${legend([["hist", "Saved draws"], ["exact", "Exact posterior"]])}
      ${gibbsDensity({ ...exact, samples: chain })}
      <p class="chart-note">Sample mean ${grams(mean)} · Sample SD ${sd.toFixed(2)} g<br>Exact mean ${grams(exact.mean)} · Exact SD ${exact.sd.toFixed(2)} g</p>`;
  }
  const trace = saved.length
    ? `<div class="saved"><h3>Saved line draws</h3>${tracePlot(saved)}</div>`
    : "";
  let next = "Show a longer run";
  if (nextStep) next = nextStep.coordinate === "Line" ? "Draw the line offset" : `Draw machine ${nextStep.coordinate}`;
  if (nextLesson) next = nextLesson.title;
  if (longRun) next = "Walkthrough complete";
  const side = longRun ? `<h3>Hand-stepped sweeps</h3>${trace}` : stateTable(step) + trace;
  return {
    progress: longRun ? "Longer Gibbs run" : lesson ? "Sweep 1 · Conditional distribution" : progress, title, cue, next,
    html: scene(plot, side, observedRecords(names)),
  };
}

const views = {
  generate: { render: generationView, max: generationEnd },
  learn: { render: inferenceView, max: learningStages.length - 1 },
  gibbs: { render: gibbsView, max: gibbsStages.length - 1 },
};

function activeChapter() {
  const hash = window.location.hash.slice(1);
  return Object.hasOwn(views, hash) ? hash : "generate";
}

function render() {
  const active = activeChapter();
  const view = views[active];
  const index = indices[active];
  const page = view.render(index);
  get("chapter").textContent = page.title;
  get("progress").textContent = page.progress;
  get("cue").textContent = page.cue;
  get("next").textContent = page.next;
  get("next").disabled = active === "gibbs" && index === view.max;
  get("back").disabled = get("restart").disabled = index === 0;
  get("workspace").innerHTML = page.html;
  document.querySelectorAll("nav a").forEach((link) => {
    if (link.hash.slice(1) === active) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  get("activity").hidden = false;
}

get("next").addEventListener("click", () => {
  const chapter = activeChapter();
  if (indices[chapter] < views[chapter].max) {
    indices[chapter] += 1;
    render();
    if (get("next").disabled) get("chapter").focus({ preventScroll: true });
  } else if (chapter !== "gibbs") {
    window.location.hash = "gibbs";
  }
});

get("back").addEventListener("click", () => {
  const chapter = activeChapter();
  indices[chapter] = Math.max(0, indices[chapter] - 1);
  render();
  if (get("back").disabled) get("next").focus({ preventScroll: true });
});

get("restart").addEventListener("click", () => {
  indices[activeChapter()] = 0;
  render();
  get("next").focus({ preventScroll: true });
});

window.addEventListener("hashchange", () => {
  render();
  get("chapter").focus({ preventScroll: true });
});
compact.addEventListener("change", render);
render();
