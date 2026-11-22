const svgNS = "http://www.w3.org/2000/svg";
const trackRadius = 79;
const startColor = "#14756e";
const handColor = "#b34e28";

function add(parent, tag, attrs, content) {
  const element = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  if (content !== undefined) element.textContent = content;
  parent.appendChild(element);
  return element;
}

function rotate(value, modulus) {
  return `rotate(${360 * value / modulus})`;
}

function drawScale(group, modulus) {
  group.replaceChildren();
  const stride = modulus <= 20 ? 1 : modulus <= 40 ? 2 : 4;
  for (let value = 0; value < modulus; value++) {
    const numbered = value % stride === 0 && (value === 0 || modulus - value >= stride);
    add(group, "line", {
      x1: 0, x2: 0, y1: -83, y2: numbered ? -91 : -87,
      transform: rotate(value, modulus),
      stroke: numbered ? "#77948d" : "#aac0b8", "stroke-width": numbered ? 1.65 : 1.25,
    });
    if (numbered) {
      const angle = 2 * Math.PI * value / modulus;
      add(group, "text", {
        x: 104 * Math.sin(angle), y: -104 * Math.cos(angle),
        "text-anchor": "middle", dy: ".35em", "font-size": 14, "font-weight": value === 0 ? 700 : 500,
        fill: value === 0 ? "#164d4b" : "#445e5a",
      }, value);
    }
  }
}

export function createDial(svg) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", "-118 -118 236 236");
  svg.setAttribute("role", "img");
  const title = add(svg, "title", {}, "Modular dial");
  add(svg, "circle", { r: trackRadius, fill: "#f1f7f3", stroke: "#b4cbc0", "stroke-width": 1.5 });
  const scale = add(svg, "g", { "stroke-linecap": "round" });
  const start = add(svg, "g", {});
  add(start, "line", {
    x1: 0, x2: 0, y1: -32, y2: -74, stroke: startColor, "stroke-width": 1.5,
    "stroke-dasharray": "2 4", "stroke-linecap": "round",
  });
  add(start, "path", { d: "M 0 -86 l 6 7 -6 7 -6 -7 Z", fill: startColor, stroke: "white", "stroke-width": 1.4 });
  const target = add(svg, "circle", {
    cx: 0, cy: -trackRadius, r: 7.5, fill: "none", stroke: handColor, "stroke-width": 1.8,
  });

  const hand = add(svg, "g", {});
  add(hand, "path", {
    d: "M -2.7 0 L -1.4 -79 L 1.4 -79 L 2.7 0 Z", fill: handColor,
  });
  add(hand, "circle", { cx: 0, cy: -trackRadius, r: 4, fill: handColor, stroke: "white", "stroke-width": 1.3 });
  add(svg, "circle", { r: 30, fill: "#fff", stroke: "#cfdfd6", "stroke-width": 1.3 });
  const modulusLabel = add(svg, "text", {
    "text-anchor": "middle", dy: ".31em", fill: "#164d4b",
    "font-family": "var(--serif, Georgia, serif)", "font-size": 17,
  });

  let previousModulus, previousFrom, previousInput, previousTo, previousPhase;
  return {
    update({ m, from, input = from, to, position, progress }) {
      if (previousModulus !== m) {
        drawScale(scale, m);
        modulusLabel.textContent = `mod ${m}`;
      }
      if (previousModulus !== m || previousFrom !== from || previousTo !== to) {
        start.setAttribute("transform", rotate(from, m));
        target.setAttribute("transform", rotate(to, m));
      }
      hand.setAttribute("transform", rotate(position, m));

      // Keep the accessible description stable while the hand sweeps past ticks.
      const phase = progress >= 1 ? "landed" : progress <= 0 ? "start" : "moving";
      if (phase !== previousPhase || m !== previousModulus || from !== previousFrom || input !== previousInput || to !== previousTo) {
        const state = phase === "landed" ? `The hand has landed at ${to}.`
          : phase === "start" ? `The hand starts at ${from}.` : "The hand is moving.";
        const description = `Modulo ${m} dial. The residues increase clockwise from zero. Input ${input}, output ${to}. ${state}`;
        svg.setAttribute("aria-label", description);
        title.textContent = description;
      }
      previousModulus = m;
      previousFrom = from;
      previousInput = input;
      previousTo = to;
      previousPhase = phase;
    },
  };
}
