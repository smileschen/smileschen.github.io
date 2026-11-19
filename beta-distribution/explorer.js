"use strict";

const compare = byId("compare");

function createView(index, controls, summary, initial) {
  const view = createParameterView({
    prefix: `distribution-${index}`,
    title: `Distribution ${index}`,
    controls,
    initial,
    onChange: refresh
  });
  summary.append(byId("summary-template").content.cloneNode(true));
  view.summary = summary;
  if (index === 2) view.dash = [8, 4];
  return view;
}

function showSummary(view) {
  const p = describe(view.values);
  view.summary.querySelector("[data-beta-label]").textContent = betaLabel(p);
  view.summary.querySelector("[data-mean]").textContent = display(p.mean);
  view.summary.querySelector("[data-mode]").textContent = modeLabel(p.modes);
  showBoundary(view.summary.querySelector("[data-boundary]"), p.poles);
}

const views = [
  createView(1, byId("first-controls"), byId("first-summary"), { alpha: 81, beta: 219 }),
  createView(2, byId("second-controls"), byId("second-summary"), shapesFromMode(80 / 298, 75))
];

const queueDraw = connectChart(byId("density-chart"), () => compare.checked ? views : views.slice(0, 1));

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
refresh();
