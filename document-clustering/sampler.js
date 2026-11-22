const gibbsSampler = (() => {
  function emptyCluster(vocabularySize) {
    return { counts: Array(vocabularySize).fill(0), documents: 0, tokens: 0 };
  }

  function copyClusters(clusters) {
    return clusters.map(cluster => ({ ...cluster, counts: cluster.counts.slice() }));
  }

  function adjustCluster(cluster, counts, direction) {
    cluster.documents += direction;
    counts.forEach((count, column) => {
      const delta = direction * count;
      cluster.counts[column] += delta;
      cluster.tokens += delta;
    });
  }

  function logProduct(start, length) {
    let sum = 0;
    for (let offset = 0; offset < length; offset++) {
      sum += Math.log(start + offset);
    }
    return sum;
  }

  function scoreClusters(clusters, counts, documentCount) {
    const documentTokens = counts.reduce((sum, count) => sum + count, 0);
    const scores = clusters.map(cluster => {
      const logSize = Math.log(cluster.documents + 1) - Math.log(documentCount - 1 + clusters.length);
      const logDenominator = logProduct(cluster.tokens + counts.length, documentTokens);
      const wordTerms = [];
      let logNumerator = 0;

      counts.forEach((count, column) => {
        if (count === 0) return;
        const base = cluster.counts[column] + 1;
        const logTerm = logProduct(base, count);
        wordTerms.push({ column, count, base, logTerm });
        logNumerator += logTerm;
      });

      const logWords = logNumerator - logDenominator;
      return { logSize, logWords, logWeight: logSize + logWords, logNumerator, logDenominator, wordTerms };
    });

    // A common shift preserves the ratios and keeps the largest weight at one.
    const maxLogWeight = Math.max(...scores.map(score => score.logWeight));
    const weights = scores.map(score => Math.exp(score.logWeight - maxLogWeight));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    scores.forEach((score, index) => {
      score.shiftedWeight = weights[index];
      score.probability = weights[index] / weightTotal;
    });
    return { scores, maxLogWeight, weightTotal };
  }

  function randomAssignments(size, random = Math.random) {
    return Array.from({ length: size }, () => Math.floor(random() * 2));
  }

  function initialize(assignments, documents, vocabularySize) {
    const clusters = [emptyCluster(vocabularySize), emptyCluster(vocabularySize)];
    documents.forEach((document, index) => {
      adjustCluster(clusters[assignments[index]], document.counts, 1);
    });

    return {
      assignments: assignments.slice(),
      documents,
      clusters,
      nextIndex: 0,
      sweep: 1,
      completedSweeps: 0,
      changedThisSweep: 0,
      sweepHistory: [],
    };
  }

  function update(state, random = Math.random) {
    const index = state.nextIndex;
    const sweep = state.sweep;
    const counts = state.documents[index].counts;
    const previousCluster = state.assignments[index];
    const before = copyClusters(state.clusters);

    const excluded = copyClusters(before);
    adjustCluster(excluded[previousCluster], counts, -1);
    const { scores, maxLogWeight, weightTotal } = scoreClusters(excluded, counts, state.documents.length);

    const draw = random();
    const newCluster = draw <= scores[0].probability ? 0 : 1;
    const after = copyClusters(excluded);
    adjustCluster(after[newCluster], counts, 1);

    state.assignments[index] = newCluster;
    state.clusters = copyClusters(after);
    if (newCluster !== previousCluster) state.changedThisSweep++;
    state.nextIndex = index + 1;
    if (state.nextIndex === state.documents.length) {
      state.sweepHistory.push({
        sweep,
        sampled: state.nextIndex,
        changed: state.changedThisSweep,
        clusterSizes: after.map(cluster => cluster.documents),
      });
      // Three visible sweeps plus one extra when revisiting the last update before restoration.
      if (state.sweepHistory.length > 4) state.sweepHistory.shift();
      state.changedThisSweep = 0;
      state.nextIndex = 0;
      state.completedSweeps = sweep;
      state.sweep += 1;
    }

    return { index, sweep, previousCluster, newCluster, before, excluded, after, scores, maxLogWeight, weightTotal, draw };
  }

  return { initialize, update, randomAssignments };
})();
