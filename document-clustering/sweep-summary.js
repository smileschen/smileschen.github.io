function renderSweepHistory(container, sampler, transaction, stage) {
  const completed = transaction && stage !== "restore" ? transaction.sweep - 1 : sampler.completedSweeps;
  const recent = sampler.sweepHistory.filter(result => result.sweep <= completed).slice(-3);
  container.hidden = recent.length === 0;
  container.replaceChildren();
  if (!recent.length) return;

  const latest = recent[recent.length - 1];
  const heading = document.createElement("h3");
  heading.textContent = `Sweep ${latest.sweep} complete`;
  const summary = document.createElement("p");
  const changed = latest.changed === 1 ? "label changed" : "labels changed";
  summary.textContent = `${latest.sampled} documents sampled · ${latest.changed} ${changed}`;
  container.append(heading, summary);

  const table = document.createElement("table");
  const caption = table.createCaption();
  caption.className = "sr-only";
  caption.textContent = "Recent completed sweeps and ending document counts for each cluster";
  const header = table.createTHead().insertRow();
  for (const label of ["Sweep", "Sampled", "Changed", "C1 docs", "C2 docs"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    header.append(cell);
  }

  const body = table.createTBody();
  for (const { sweep, sampled, changed, clusterSizes } of recent) {
    const row = body.insertRow();
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = sweep;
    row.append(name);
    for (const value of [sampled, changed, ...clusterSizes]) row.insertCell().textContent = value;
  }
  container.append(table);
}
