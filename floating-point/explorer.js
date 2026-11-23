import { makeFormat, decode, roundToCode } from './model.js';
import { createNumberLine } from './number-line.js';

const byId = id => document.getElementById(id);
const register = byId('register');
const wordInput = byId('word');
const realInput = byId('real-input');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const classifications = { normal: 'Normal', subnormal: 'Subnormal', zero: 'Zero', infinity: 'Infinity', nan: 'NaN' };
const initialCode = 0b1001010;
let format = makeFormat(3, 4);
let code = initialCode;
let real = decode(code, format).value;
let digitButtons = [];
let landmarks = [];
let interval = null;
const line = createNumberLine(byId('number-line'), { onInput: selectReal });

// Each finite value in these formats has an exact decimal with at most 20 places.
function exact(x) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return '+∞';
  return x.toFixed(20).replace(/\.?0+$/, '') || '0';
}
function signed(x) { return String(x).replace('-', '−'); }
function pow2(x) { return '2<sup>' + signed(x) + '</sup>'; }
function binary(bits) { return '<span class="binary">' + bits + '<sub>2</sub></span>'; }
function inputText(x) {
  return Number.isFinite(x) ? String(x) : exact(x);
}
function announce(message) { byId('announcement').textContent = message; }

function buildRegister() {
  register.replaceChildren();
  digitButtons = [];
  register.style.setProperty('--exp', format.e + 'fr');
  register.style.setProperty('--mant', format.m + 'fr');
  register.classList.toggle('wide', format.e + format.m >= 9);
  for (const [field, width] of [['Sign', 1], ['Exponent', format.e], ['Mantissa', format.m]]) {
    const group = document.createElement('div');
    group.className = 'bit-group ' + field.toLowerCase();
    const title = document.createElement('div');
    title.className = 'bit-label';
    title.textContent = field;
    group.append(title);
    const cells = document.createElement('div');
    cells.className = 'bits';
    cells.style.setProperty('--count', width);
    for (let i = 0; i < width; i++) {
      const cell = document.createElement('div');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bit';
      b.innerHTML = '<span class="digit-window"><span class="digit"></span></span>';
      const weight = document.createElement('span');
      weight.className = 'bit-weight';
      if (field === 'Sign') {
        b.disabled = true;
        b.setAttribute('aria-label', 'Sign bit locked at zero, nonnegative values');
        b.querySelector('.digit').textContent = '0';
        weight.innerHTML = '<svg viewBox="0 0 16 16" aria-label="Locked" role="img"><rect x="3.4" y="7.1" width="9.2" height="6.6" rx="1.3"/><path d="M5.5 7V4.9a2.5 2.5 0 0 1 5 0V7"/></svg>';
      } else {
        const power = field === 'Exponent' ? width - 1 - i : -1 - i;
        weight.innerHTML = pow2(power);
        const index = digitButtons.length;
        b.dataset.index = index;
        b.dataset.label = field + ' bit ' + (i + 1) + ' of ' + width;
        digitButtons.push(b);
      }
      cell.append(b, weight);
      cells.append(cell);
    }
    group.append(cells);
    register.append(group);
  }
  byId('format-label').textContent = (1 + format.e + format.m) + '-bit format';
  byId('exp-width').textContent = format.e;
  byId('mant-width').textContent = format.m;
  byId('exp-less').disabled = format.e <= 2;
  byId('exp-more').disabled = format.e >= 5;
  byId('mant-less').disabled = format.m <= 1;
  byId('mant-more').disabled = format.m >= 6;
  wordInput.placeholder = '0 ' + '0'.repeat(format.e) + ' ' + '0'.repeat(format.m);
  buildLandmarks();
}

function renderDigits(d, animate, backwards) {
  const bits = d.exponentBits + d.fractionBits;
  digitButtons.forEach((b, i) => {
    const digit = b.querySelector('.digit');
    if (digit.textContent === bits[i]) return;
    const oldValue = digit.textContent;
    const container = digit.parentElement;
    container.querySelector('.old-digit')?.remove();
    digit.getAnimations().forEach(animation => animation.cancel());
    digit.textContent = bits[i];
    b.setAttribute('aria-label', b.dataset.label + ', ' + bits[i]);
    b.setAttribute('aria-pressed', String(bits[i] === '1'));
    if (!animate || !oldValue || reduceMotion.matches) return;
    const old = document.createElement('span');
    old.className = 'old-digit';
    old.setAttribute('aria-hidden', 'true');
    old.textContent = oldValue;
    container.append(old);
    const dist = backwards ? -100 : 100;
    const timing = { duration: 220, easing: 'cubic-bezier(.18,.72,.24,1)' };
    digit.animate([{transform: 'translateY(' + dist + '%)'}, {transform:'translateY(0)'}], timing);
    const roll = old.animate([{transform:'translateY(0)'}, {transform: 'translateY(' + -dist + '%)'}], timing);
    roll.onfinish = () => old.remove();
  });
}

function buildLandmarks() {
  landmarks = [
    {label: 'Zero', code: 0},
    {label: 'Smallest positive', code: 1, note: 'Smallest positive value. One subnormal step above zero.'},
    {label: 'Smallest normal', code: format.minNormalCode, note: 'Smallest normalized value. The implicit leading bit has just changed to 1.'},
    {label: 'Machine epsilon', code: format.epsilonCode, note: 'Machine epsilon (ε). This value equals the gap from 1 to the next larger stored value.'},
    {label: '1 + ε', code: format.nextAfterOneCode, note: 'First tick above 1. Its distance from 1 is machine epsilon, ' + exact(format.epsilon) + '.'},
    {label: 'Largest finite', code: format.maxFiniteCode, note: 'Largest finite value. The next bit pattern encodes positive infinity.'},
    {label: 'Infinity', code: format.infinityCode},
    {label: 'NaN', code: format.nanCode}
  ];
  const row = byId('landmarks');
  row.replaceChildren();
  for (const item of landmarks) {
    const button = document.createElement('button');
    button.type = 'button';
    const value = exact(decode(item.code, format).value);
    const shortValue = value.length > 11 ? Number(value).toExponential(4).replace('e-', 'e−') : value;
    const marker = Number.isFinite(Number(value)) && Number(shortValue.replace('−','-')) !== Number(value) ? '≈' : '';
    button.innerHTML = '<span>' + item.label + '</span><strong>' + marker + shortValue + '</strong>';
    button.title = item.label + ' · ' + value;
    button.addEventListener('click', () => {
      selectCode(item.code);
      if (item.code === format.nextAfterOneCode) line.setView('near');
    });
    row.append(button);
    item.button = button;
  }
}

function renderCalculation(d) {
  const display = byId('decimal');
  const value = exact(d.value);
  display.textContent = value;
  display.className = value.length > 13 ? 'long-value' : value.length > 7 ? 'medium-value' : '';
  const kind = byId('kind');
  kind.textContent = classifications[d.kind];
  kind.dataset.kind = d.kind;
  const notes = [];
  for (const item of landmarks) {
    const selected = item.code === code || (item.label === 'NaN' && d.kind === 'nan');
    item.button.setAttribute('aria-pressed', String(selected));
    if (selected && item.note) notes.push(item.note);
  }
  if (code === format.oneCode) notes.push('The next tick is 1 + ε = ' + exact(1 + format.epsilon) + '.');
  if (!notes.length && code < format.maxFiniteCode) {
    const next = decode(code + 1, format).value;
    notes.push('The next tick is ' + exact(next) + ', a step of ' + exact(next - d.value) + '.');
  }
  if (d.kind === 'infinity') notes.push('With this format, a finite real input rounds to +∞ at ' + exact(format.overflowThreshold) + ' or above.');
  if (d.kind === 'nan') notes.push('An undefined operation such as 0 ÷ 0 produces NaN.');
  byId('selection-note').textContent = notes.join(' ');
  byId('selection-note').hidden = !notes.length;
  const exp = byId('exponent-calc');
  const mant = byId('mantissa-calc');
  const equation = byId('equation');
  if (d.leading === null) {
    equation.textContent = d.kind === 'infinity' ? 'Positive infinity' : 'Not a number';
    exp.innerHTML = binary(d.exponentBits) + ' = ' + d.exponentField + ' <span class="explain">· all ones, reserved</span>';
    mant.innerHTML = binary(d.fractionBits) + (d.kind === 'infinity' ? ' = 0 <span class="explain">· encodes infinity</span>' : ' ≠ 0 <span class="explain">· encodes NaN</span>');
    return;
  }
  const sub = d.exponentField === 0;
  exp.innerHTML = binary(d.exponentBits) + ' = ' + d.exponentField +
    '<span class="math-next">' + (sub ? 'Use 1 − ' : d.exponentField + ' − ') + format.bias + ' = <strong>' + signed(d.exponent) + '</strong> <span class="explain">' + (sub ? '(fixed exponent)' : '(after bias)') + '</span></span>';
  const terms = [String(d.leading)];
  [...d.fractionBits].forEach((v, i) => { if (v === '1') terms.push('1/' + 2 ** (i + 1)); });
  mant.innerHTML = binary('<strong>' + d.leading + '</strong>.' + d.fractionBits) + ' <span class="explain">· leading ' + d.leading + '</span><span class="math-next">' + terms.join(' + ') + (terms.length > 1 ? ' = <strong>' + exact(d.significand) + '</strong>' : '') + '</span>';
  equation.innerHTML = '<span class="mant-ink">' + exact(d.significand) + '</span> × <span class="exp-ink">' + pow2(d.exponent) + '</span>';
}

function roundingMessage(d) {
  if (d.kind === 'nan') return 'NaN has no position on the real number line.';
  if (d.kind === 'infinity') return real === Infinity ? 'Positive infinity lies beyond every finite tick.' : 'Overflow. Inputs at or above ' + exact(format.overflowThreshold) + ' round to positive infinity.';
  if (real === d.value) return 'Exact match. The real input lies on a representable tick.';
  if (real > format.maxFinite) return 'Above the largest finite tick, but below the overflow threshold of ' + exact(format.overflowThreshold) + '.';
  const lowCode = real > d.value ? code : code - 1;
  const lo = decode(lowCode, format).value;
  const hi = decode(lowCode + 1, format).value;
  if (real === (lo + hi) / 2) return 'Exactly halfway between ' + exact(lo) + ' and ' + exact(hi) + '. The last bit of ' + exact(d.value) + ' is 0, so ties to even selects it.';
  return 'Between ' + exact(lo) + ' and ' + exact(hi) + '. The closer tick is ' + exact(d.value) + '.';
}

function render({animate = true, backwards = false, editing = ''} = {}) {
  const d = decode(code, format);
  renderDigits(d, animate, backwards);
  renderCalculation(d);
  if (editing !== 'word') {
    wordInput.value = '0 ' + d.exponentBits + ' ' + d.fractionBits;
    wordInput.removeAttribute('aria-invalid');
    byId('word-note').textContent = 'Include the locked sign bit. Spaces are optional.';
  }
  if (editing !== 'real') realInput.value = inputText(real);
  realInput.removeAttribute('aria-invalid');
  byId('rounded').textContent = exact(d.value);
  byId('rounding-note').textContent = roundingMessage(d);
  byId('prev').disabled = code === 0;
  byId('next').disabled = code === 2 ** (format.e + format.m) - 1;
  line.update({format, code, real});
}

function stop() {
  clearInterval(interval);
  interval = null;
  byId('play-text').textContent = 'Play count';
  byId('play-icon').setAttribute('d', 'M5 3.5 14 9l-9 5.5Z');
}
function selectCode(next, {editing = '', playing = false} = {}) {
  if (!playing) stop();
  const backwards = next < code;
  code = next;
  real = decode(code, format).value;
  render({backwards, editing});
  if (!playing) announce('Stored value ' + exact(real) + ', ' + classifications[decode(code, format).kind] + '. ' + byId('selection-note').textContent);
}
function selectReal(next, editing = '') {
  stop();
  real = next;
  const previous = code;
  code = roundToCode(real, format);
  render({backwards: code < previous, editing});
}
function resize(e, m) {
  stop();
  format = makeFormat(e, m);
  code = roundToCode(real, format);
  buildRegister();
  render({animate: false});
  announce('Format changed to ' + e + ' exponent bits and ' + m + ' mantissa bits. Stored value ' + exact(decode(code, format).value) + '.');
}

register.addEventListener('click', event => {
  const bit = event.target.closest('button[data-index]');
  if (bit) selectCode(code ^ (1 << (digitButtons.length - 1 - Number(bit.dataset.index))));
});
register.addEventListener('keydown', event => {
  const bit = event.target.closest('button[data-index]');
  if (!bit || event.altKey || event.ctrlKey || event.metaKey) return;
  const i = Number(bit.dataset.index);
  if (/^[01]$/.test(event.key)) {
    event.preventDefault();
    const mask = 1 << (digitButtons.length - 1 - i);
    selectCode(event.key === '1' ? code | mask : code & ~mask);
    digitButtons[Math.min(i + 1, digitButtons.length - 1)].focus();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    digitButtons[Math.max(0, Math.min(digitButtons.length - 1, i + (event.key === 'ArrowLeft' ? -1 : 1)))].focus();
  }
});
function parseWord() {
  const bits = wordInput.value.replace(/\s/g, '');
  const ok = bits.length === 1 + format.e + format.m && /^0[01]+$/.test(bits);
  wordInput.setAttribute('aria-invalid', String(!ok));
  byId('word-note').textContent = ok ? 'Bit string applied.' : 'Enter ' + (1 + format.e + format.m) + ' bits, beginning with the sign bit 0.';
  if (ok) selectCode(parseInt(bits.slice(1), 2), {editing: 'word'});
  return ok;
}
function showWord(open) {
  byId('word-editor').hidden = !open;
  byId('open-word').setAttribute('aria-expanded', String(open));
  if (open) { stop(); wordInput.focus(); wordInput.select(); }
  else { render({animate: false}); byId('open-word').focus(); }
}
byId('open-word').addEventListener('click', () => showWord(byId('word-editor').hidden));
wordInput.addEventListener('input', parseWord);
wordInput.addEventListener('keydown', event => {
  if (event.key === 'Escape' || (event.key === 'Enter' && parseWord())) showWord(false);
});
register.addEventListener('paste', event => {
  event.preventDefault();
  showWord(true);
  wordInput.value = event.clipboardData.getData('text/plain');
  parseWord();
});

byId('exp-less').onclick = () => resize(format.e - 1, format.m);
byId('exp-more').onclick = () => resize(format.e + 1, format.m);
byId('mant-less').onclick = () => resize(format.e, format.m - 1);
byId('mant-more').onclick = () => resize(format.e, format.m + 1);
byId('prev').onclick = () => selectCode(code - 1);
byId('next').onclick = () => selectCode(code + 1);
function play() {
  const last = 2 ** (format.e + format.m) - 1;
  function tick() {
    selectCode(code === last ? 0 : code + 1, {playing: true});
    if (code === last) { stop(); announce('Count complete. All bits after the sign are 1.'); }
  }
  tick();
  if (code === last) return;
  interval = setInterval(tick, Number(byId('speed').value));
  byId('play-text').textContent = 'Pause';
  byId('play-icon').setAttribute('d', 'M4.5 3.5h3.2v11H4.5zM10.3 3.5h3.2v11h-3.2z');
}
byId('play').onclick = () => interval === null ? play() : stop();
byId('speed').onchange = () => { if (interval !== null) { stop(); play(); } };
byId('reset').onclick = () => {
  stop();
  byId('word-editor').hidden = true;
  byId('open-word').setAttribute('aria-expanded', 'false');
  byId('speed').value = '750';
  format = makeFormat(3, 4);
  code = initialCode;
  real = decode(code, format).value;
  buildRegister();
  render({animate: false});
  line.setView('full');
  announce('Starting format restored. Stored value 3.25.');
};

realInput.addEventListener('focus', () => { stop(); realInput.select(); });
realInput.addEventListener('input', () => {
  const raw = realInput.value.trim();
  let x;
  if (/^\+?(?:inf(?:inity)?|∞)$/i.test(raw)) x = Infinity;
  else if (/^nan$/i.test(raw)) x = NaN;
  else if (/^\+?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) x = Number(raw);
  else {
    realInput.setAttribute('aria-invalid', 'true');
    byId('rounding-note').textContent = 'Enter a nonnegative number, +∞, or NaN.';
    return;
  }
  selectReal(x, 'real');
});
realInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') { render(); realInput.blur(); }
  if (event.key === 'Enter' && realInput.getAttribute('aria-invalid') !== 'true') {
    realInput.blur();
    announce(byId('rounding-note').textContent);
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });

buildRegister();
render({animate: false});
