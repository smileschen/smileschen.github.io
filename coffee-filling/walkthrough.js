"use strict";

const { target, data, generation, fits, steps, chain, warmup } = coffeeData;
const names = Object.keys(data);
const coordinates = [...names, "Line"];
const chosenMachine = "B";
const simulatedBags = generation.bags[chosenMachine].slice(0, 4);
const bagTotal = names.reduce((total, name) => total + data[name].length, 0);
const generationEnd = 1 + names.length + simulatedBags.length;
const sweepCount = steps.at(-1).sweep;
const chapterOrder = ["generate", "learn", "gibbs"];
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
const inferenceAxis = offsetAxis(fits.flatMap((fit) => [
  ...Object.values(fit.machines).map((record) => record.observed),
  ...[fit.line, ...Object.values(fit.machines)].flatMap(({ mean, sd }) =>
    [mean - credibleZ * sd, mean + credibleZ * sd]),
]), 4);
const conditionalAxis = offsetAxis([
  ...chain,
  ...steps.map((step) => step.draw),
  ...[fits.at(-1).line, ...steps].flatMap(({ mean, sd }) => [mean - 3.5 * sd, mean + 3.5 * sd]),
], 4);
const traceAxis = offsetAxis(steps.filter((step) => step.coordinate === "Line").map((step) => step.draw), 2);

function horizontalAxis(sc, y, ticks) {
  const tickMarks = ticks.map((value) => {
    const at = sc.x(value);
    return line(at, y, at, y + 5, "axis") + label(at, y + 21, offset(value, 0), "middle");
  }).join("");
  return line(sc.left, y, sc.right, y, "axis") + tickMarks
    + label((sc.left + sc.right) / 2, y + 42, `Fill deviation from ${target} g (g)`, "middle");
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
    next = complete ? "Continue to weighed bags" : "Draw the next bag";
  }
  if (complete) {
    cue = `Two of these bags fall on each side of machine ${chosenMachine}’s ${fillWeight(generation.machines[chosenMachine])} average. Next we’ll use these same four weights, four more from B, and bags drawn from the curves for A, C, and D to estimate the machine averages.`;
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
      <p class="line-record">Observed average ${fillWeight(observed)}</p>
      <ul class="record-list">${bags}</ul></div>`;
  }).join("");
  return `<section class="data-card"><h3>Weighed bags from this simulated line</h3>
    <div class="record-grid">${records}</div></section>`;
}

function inferencePlot(fit, previous) {
  const { min, max, ticks } = inferenceAxis;
  const sc = scale(min, max, 49);
  let body = line(sc.x(0), 17, sc.x(0), 230, "target");
  coordinates.forEach((name, i) => {
    const row = 29 + i * 45;
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
    const postY = row + 7;
    body += line(left, postY, right, postY, "interval") + line(left, postY - 4, left, postY + 4, "interval")
      + line(right, postY - 4, right, postY + 4, "interval") + mark(midpoint, postY, "posterior-mark");
    if (!isLine) body += mark(sc.x(record.observed), row - 7, "observed-mark");
    if (name === "A" && previous) {
      const old = sc.x(previous.machines.A.mean);
      const previousY = row + 18;
      body += line(old - 3, previousY - 3, old + 3, previousY + 3, "compare-mark")
        + line(old + 3, previousY - 3, old - 3, previousY + 3, "compare-mark");
    }
  });
  body += horizontalAxis(sc, 238, ticks);
  return svg(body, 287, `Observed means and posterior means with 95 percent credible intervals. Machine A’s posterior mean offset is ${grams(fit.machines.A.mean)}. Machine B’s is ${grams(fit.machines.B.mean)}. The line’s is ${grams(fit.line.mean)}.`);
}

function inferenceView(index) {
  const fit = fits[index];
  const previous = fits[index - 1];
  const complete = index === fits.length - 1;
  const introduced = names[1 + index];
  const title = previous ? `Records from ${introduced} update A’s estimate` : "Start with bags from A and B";
  let cue = `Set aside the machine means used to simulate these bags. The open circles show the observed averages of ${fillWeight(fit.machines.A.observed)} from A’s two bags and ${fillWeight(fit.machines.B.observed)} from B’s eight. B’s record includes the four bags shown earlier.`;
  if (previous) {
    cue = `A’s two bags weigh the same as before. Adding ${introduced} changes the estimate for the shared line. Follow the filled dot for A from ${grams(previous.machines.A.mean)} to ${grams(fit.machines.A.mean)}.`;
  }
  if (complete) cue += " Compare the intervals for A and B. A’s two bags give less information about its long-run average than B’s eight do.";
  const legendItems = [["open", "Observed average"], ["posterior", "Posterior mean and 95% interval"]];
  if (previous) legendItems.push(["previous", "Previous estimate for A"]);
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
    progress: `Observed data · ${index + 2} of ${names.length} machines`, title, cue,
    next: complete ? "Continue to Gibbs sampling" : `Weigh bags from ${names[index + 2]}`,
    html: scene(plot, side, observedRecords(Object.keys(fit.machines))),
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

function gibbsView(index) {
  const longRun = index > steps.length;
  const step = steps[Math.min(index, steps.length) - 1];
  const nextStep = steps[index];
  const saved = steps.slice(0, index).filter((entry) => entry.coordinate === "Line");
  const complete = saved.length === sweepCount;
  const progress = step ? `Sweep ${step.sweep} of ${sweepCount} · Update ${(index - 1) % coordinates.length + 1} of ${coordinates.length}`
    : `${sweepCount} sweeps · Ready to start`;
  let title = `Keep the ${bagTotal} observed bags fixed`;
  let cue = "Adding records changed the posterior in the previous activity. Here the evidence stays fixed. Start with all five offsets at 0 g, then draw A using the current line offset and A’s two bags.";
  let plot = `<h3>Update order</h3><p>Draw A, B, C, and D at the current line offset. Then draw the line offset using the four fresh machine values. Save each completed sweep.</p>`;
  if (step && !longRun) {
    const lineUpdate = step.coordinate === "Line";
    title = lineUpdate ? "Draw the line offset" : `Draw machine ${step.coordinate}’s offset`;
    if (lineUpdate) {
      const save = complete ? "Save this line draw with the completed fourth sweep." :
        `Save this line draw and carry ${grams(step.draw)} forward to sweep ${step.sweep + 1}.`;
      cue = `Use the four machine offsets drawn in sweep ${step.sweep}. ${save}`;
    } else {
      const fromPrevious = step.sweep > 1 && step.coordinate === "A" ? " from the previous sweep" : "";
      cue = `Use ${grams(step.before.Line)} for the line${fromPrevious} and machine ${step.coordinate}’s ${data[step.coordinate].length} observed bags to center this Normal distribution.`;
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
  if (longRun) next = "Walkthrough complete";
  const side = longRun ? `<h3>Hand-stepped sweeps</h3>${trace}` : stateTable(step) + trace;
  return {
    progress: longRun ? "Longer Gibbs run" : progress, title, cue, next,
    html: scene(plot, side, observedRecords(names)),
  };
}

const views = {
  generate: { render: generationView, max: generationEnd },
  learn: { render: inferenceView, max: fits.length - 1 },
  gibbs: { render: gibbsView, max: steps.length + 1 },
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
    window.location.hash = chapterOrder[chapterOrder.indexOf(chapter) + 1];
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
