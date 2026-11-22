function renderWordLesson({ transaction, stage, documents, vocabulary }) {
  if (!transaction || transaction.sweep !== 1 || transaction.index !== 0) return null;

  const eggColumn = vocabulary.indexOf("egg");
  const documentCounts = documents[0].counts;
  const copies = documentCounts[eggColumn];
  const stemCount = documentCounts.filter(count => count > 0).length;
  const restored = stage === "restore" || stage === "after";
  const snapshot = restored ? "after" : stage === "before" ? "before" : "excluded";
  const snapshots = [
    ["before", "Before removal"],
    ["excluded", "Held out"],
    ["after", "Restored"],
  ];
  const make = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };

  const lesson = document.createElement("section");
  lesson.className = "word-lesson";
  lesson.setAttribute("aria-labelledby", "egg-lesson-title");
  const title = make("h3", "Follow the stem egg");
  title.id = "egg-lesson-title";
  lesson.append(title, make("p", `The ${copies} highlighted occurrences of “EGGS” in Document 01 contribute ${copies} to its egg count.`));

  const table = document.createElement("table");
  table.className = "word-lesson-table";
  table.setAttribute("aria-label", "Cluster counts of the stem egg during the update");
  const heading = table.createTHead().insertRow();
  const termName = make("th", "egg");
  termName.scope = "col";
  heading.append(termName);
  for (const [key, label] of snapshots) {
    const cell = make("th", label);
    cell.scope = "col";
    if (key === snapshot) {
      cell.className = "is-current-snapshot";
      cell.setAttribute("aria-current", "step");
    }
    heading.append(cell);
  }

  const body = table.createTBody();
  transaction.before.forEach((_, index) => {
    const row = body.insertRow();
    const cluster = make("th", `Cluster ${index + 1}`);
    cluster.scope = "row";
    row.append(cluster);
    for (const [key, label] of snapshots) {
      const cell = row.insertCell();
      if (key === snapshot) cell.className = "is-current-snapshot";
      const pending = (key === "after" && !restored) || (key === "excluded" && snapshot === "before");
      if (pending) {
        cell.className = "future-count";
        cell.textContent = "—";
        cell.setAttribute("aria-label", `${label} count pending`);
      } else {
        cell.textContent = transaction[key][index].counts[eggColumn];
      }
    }
  });
  lesson.append(table);

  const [n1, n2] = transaction.excluded.map(cluster => cluster.documents);
  if (stage === "before") {
    lesson.append(make("p", `When this passage is removed from Cluster ${transaction.previousCluster + 1}, what will happen to that cluster’s egg count?`));
  } else if (stage === "remove") {
    const prompt = n1 === n2
      ? `Each cluster now holds ${n1} other documents. Which part of the score can give one cluster the advantage?`
      : `The other documents split ${n1} in Cluster 1 and ${n2} in Cluster 2. Which cluster does the size term favor?`;
    lesson.append(make("p", prompt));
  } else {
    const sizeEffect = n1 === n2
      ? `Each cluster has ${n1} other documents, so the size terms tie. The word predictions determine the difference.`
      : `The size term favors Cluster ${n1 > n2 ? 1 : 2}, which holds ${Math.max(n1, n2)} of the other ${n1 + n2} documents.`;
    const favored = transaction.scores[0].probability >= transaction.scores[1].probability ? 0 : 1;
    const percent = transaction.scores[favored].probability * 100;
    const probability = percent > 99.9999 ? "over 99.9999%" : `${Number(percent.toFixed(4))}%`;
    lesson.append(make("p", `${sizeEffect} Combining the size term with the prediction for all ${stemCount} distinct stems gives Cluster ${favored + 1} a probability of ${probability}.`));
    if (restored) lesson.append(make("p", "The restored counts are the starting counts for Document 02."));
  }
  return lesson;
}
