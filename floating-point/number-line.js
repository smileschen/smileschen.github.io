import { decode } from './model.js';

const plotHeight = 133;
const axisY = 71;
const inset = 21;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function label(value) {
  if (value === 0) return '0';
  if (value < 0.001) {
    const shortened = value.toExponential(4);
    const [coefficient, exponent] = shortened.split('e');
    return `${Number(shortened) === value ? '' : '≈'}${Number(coefficient)}e${exponent.replace('-', '−')}`;
  }
  const shortened = Number(value.toPrecision(6));
  return (shortened === value ? '' : '≈') + shortened.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

// All horizontal coordinates, including those in the nearby view, use a linear scale.
export function createNumberLine(root, { onInput }) {
  root.classList.add('fp-number-line');
  root.innerHTML = `
    <div class="fp-line-frame">
      <div class="fp-line-slider" tabindex="0" role="slider"
           aria-label="Real input on the number line" aria-orientation="horizontal"
           aria-description="Drag to choose a real input. Use arrow keys to step between stored values. Home and End select the finite endpoints."
           aria-valuemin="0" aria-valuemax="1" aria-valuenow="0">
        <svg class="fp-line-svg" aria-hidden="true" width="100%" height="${plotHeight}">
          <g data-layer="scale"></g>
          <g data-layer="markers"></g>
        </svg>
      </div>
      <div class="fp-line-toolbar">
        <div class="fp-line-key" aria-label="Marker legend">
          <span><i class="fp-key-stored" aria-hidden="true"></i>Stored value</span>
          <span><i class="fp-key-real" aria-hidden="true"></i>Real input</span>
        </div>
        <div class="fp-line-views" role="group" aria-label="Number line scale">
          <button type="button" data-view="full" aria-pressed="true">Full range</button>
          <button type="button" data-view="near" aria-pressed="false">Close-up</button>
        </div>
      </div>
    </div>`;
  const slider = root.querySelector('.fp-line-slider');
  const scale = root.querySelector('[data-layer="scale"]');
  const markers = root.querySelector('[data-layer="markers"]');
  const viewButtons = [...root.querySelectorAll('[data-view]')];
  let format, code, real;
  let values = [];
  let available = new Set();
  let view = 'full';
  let first = 0, last = 0;
  let width = 0;
  let dragging = null;
  let lastGeometry = '';

  function x(value) {
    return inset + (value - values[first]) / (values[last] - values[first]) * (width - 2 * inset);
  }

  function centerView() {
    if (view === 'full' || code > format.maxFiniteCode) {
      first = 0;
      last = format.maxFiniteCode;
      return;
    }
    const steps = Math.min(12, Math.max(2, Math.floor(format.maxFiniteCode / 2)));
    first = clamp(code - Math.floor(steps / 2), 0, format.maxFiniteCode - steps);
    last = first + steps;
  }

  function renderScale() {
    const geometry = [width, first, last, format.e, format.m].join('/');
    if (geometry === lastGeometry) return;
    lastGeometry = geometry;
    const low = values[first], high = values[last];
    const span = high - low;
    let ticks = '', boundaries = '';
    for (let i = first; i <= last; i++) {
      const pos = x(values[i]).toFixed(3);
      if (i % format.fractionCount === 0 || i === first || i === last) {
        boundaries += `M${pos} ${axisY - 7}v19`;
      } else {
        ticks += `M${pos} ${axisY - 2}v9`;
      }
    }

    // Choose dyadic intervals aligned to real ticks, then reserve space for the endpoints.
    const labelGap = high < 0.01 || high > 1000 ? 84 : 55;
    const interval = 2 ** Math.ceil(Math.log2(span * labelGap / (width - 2 * inset)));
    const firstMultiple = Math.ceil(low / interval);
    const lastMultiple = Math.floor(high / interval);
    let guides = '', labels = '';
    function addLabel(value, anchor) {
      const pos = x(value);
      guides += `M${pos} 15V${axisY - 9}`;
      labels += `<text class="fp-axis-label" x="${pos}" y="${axisY + 31}" text-anchor="${anchor}">${label(value)}</text>`;
    }
    addLabel(low, 'start');
    let previousEnd = inset + label(low).length * 7.3;
    const lastStart = width - inset - label(high).length * 7.3;
    for (let i = firstMultiple; i <= lastMultiple; i++) {
      const value = i * interval;
      if (!available.has(value)) continue;
      const halfWidth = label(value).length * 7.3 / 2;
      const start = x(value) - halfWidth, end = x(value) + halfWidth;
      if (start < previousEnd + 12 || end > lastStart - 12) continue;
      addLabel(value, 'middle');
      previousEnd = end;
    }
    addLabel(high, 'end');
    scale.innerHTML = `<path class="fp-axis-grid" d="${guides}"></path>
      <path class="fp-axis-base" d="M${inset} ${axisY}H${width - inset}"></path>
      <path class="fp-axis-ticks" d="${ticks}"></path>
      <path class="fp-axis-boundaries" d="${boundaries}"></path>${labels}`;
  }

  function render() {
    if (!format) return;
    width = slider.clientWidth;
    if (width <= 2 * inset) return;
    renderScale();
    const stored = values[code];
    const isSpecial = stored === undefined;
    let shapes = '';
    if (Number.isFinite(real) && real >= values[first] && real <= values[last]) {
      const rawX = x(real);
      shapes += `<circle class="fp-raw-halo" cx="${rawX}" cy="${axisY}" r="10"></circle>
        <circle class="fp-raw-thumb" cx="${rawX}" cy="${axisY}" r="5"></circle>`;
    }
    if (!isSpecial && code >= first && code <= last) {
      const pos = x(stored);
      const text = label(stored);
      const badgeWidth = 19 + text.length * 7.8;
      const badgeLeft = clamp(pos - badgeWidth / 2, 4, width - badgeWidth - 4);
      shapes += `<path class="fp-stored-stem" d="M${pos} 39V${axisY - 12}"></path>
        <path class="fp-stored-pointer" d="M${pos - 4.5} ${axisY - 13}h9l-4.5 6Z"></path>
        <rect class="fp-stored-badge" x="${badgeLeft}" y="15" width="${badgeWidth}" height="24" rx="5"></rect>
        <text class="fp-stored-label" x="${badgeLeft + badgeWidth / 2}" y="31.5" text-anchor="middle">${text}</text>`;
    } else if (isSpecial) {
      const note = code === format.infinityCode ? '+∞ is beyond the finite range' : 'NaN has no position on the line';
      shapes += `<text class="fp-line-note" x="${width / 2}" y="33" text-anchor="middle">${note}</text>`;
    }
    const showEpsilon = view === 'near' && (code === format.oneCode || code === format.nextAfterOneCode)
      && first <= format.oneCode && last >= format.nextAfterOneCode;
    if (showEpsilon) {
      const left = x(1), right = x(1 + format.epsilon);
      const text = `ε = ${format.epsilon}`;
      const padding = text.length * 3.8 + 4;
      const middle = clamp((left + right) / 2, padding, width - padding);
      shapes += `<path class="fp-epsilon-bracket" d="M${left} 107v5H${right}v-5"></path>
        <text class="fp-epsilon-label" x="${middle}" y="124" text-anchor="middle">${text}</text>`;
    }
    markers.innerHTML = shapes;
    const accessible = isSpecial ? (code === format.infinityCode ? 'positive infinity' : 'NaN') : String(stored);
    slider.setAttribute('aria-valuemax', format.maxFinite);
    slider.setAttribute('aria-valuenow', Number.isNaN(real) ? 0 : clamp(real, 0, format.maxFinite));
    const spacing = showEpsilon ? `, spacing above one is ${format.epsilon}` : '';
    slider.setAttribute('aria-valuetext', isSpecial ? accessible : `Real input ${Number(real.toPrecision(10))}, stored value ${accessible}${spacing}`);
    for (const button of viewButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
      button.disabled = isSpecial && button.dataset.view === 'near';
    }
  }

  function setView(next) {
    if (!format || (next !== 'full' && next !== 'near')) return;
    view = code > format.maxFiniteCode ? 'full' : next;
    centerView();
    render();
  }

  for (const button of viewButtons) {
    button.addEventListener('click', () => setView(button.dataset.view));
  }

  function selectAt(clientX) {
    const pos = clientX - slider.getBoundingClientRect().left;
    const proportion = clamp((pos - inset) / (width - 2 * inset), 0, 1);
    onInput(values[first] + proportion * (values[last] - values[first]));
  }

  slider.addEventListener('pointerdown', event => {
    if (!format || width <= 2 * inset || !event.isPrimary || event.button !== 0) return;
    dragging = event.pointerId;
    slider.setPointerCapture(dragging);
    slider.focus({ preventScroll: true });
    selectAt(event.clientX);
  });
  slider.addEventListener('pointermove', event => {
    if (event.pointerId === dragging) selectAt(event.clientX);
  });
  const endDrag = event => { if (event.pointerId === dragging) dragging = null; };
  slider.addEventListener('pointerup', endDrag);
  slider.addEventListener('pointercancel', endDrag);
  slider.addEventListener('lostpointercapture', endDrag);
  slider.addEventListener('keydown', event => {
    if (!format || event.altKey || event.metaKey || event.ctrlKey) return;
    const moves = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 8, PageDown: -8 };
    const current = Math.min(code, format.maxFiniteCode + 1);
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = format.maxFiniteCode;
    else if (Object.hasOwn(moves, event.key)) next = clamp(current + moves[event.key], 0, format.maxFiniteCode);
    else return;
    event.preventDefault();
    onInput(values[next]);
  });
  new ResizeObserver(render).observe(slider);

  return {
    setView,
    update(state) {
      const changedFormat = !format || format.e !== state.format.e || format.m !== state.format.m;
      ({ format, code, real } = state);
      if (changedFormat) {
        values = Array.from({ length: format.maxFiniteCode + 1 }, (_, i) => decode(i, format).value);
        available = new Set(values);
      }
      if (real === undefined) real = decode(code, format).value;
      if (code > format.maxFiniteCode) view = 'full';
      if (changedFormat || view === 'full' || (dragging === null && (code < first || code > last))) centerView();
      render();
    },
  };
}
