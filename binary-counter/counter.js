const byId = id => document.getElementById(id);
const register = byId('register');
const fractional = byId('fractional');
const hexadecimal = byId('hexadecimal');
const speed = byId('speed');
const play = byId('play');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// One unit is 1/16, so all 4,096 bit patterns and every carry are exact.
const modulus = 4096;
let units = 10 * 16;
let timer = null;

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function wheelDigit(parent) {
  const window = element('span', 'wheel-window');
  const digit = element('span', 'wheel-digit');
  window.setAttribute('aria-hidden', 'true');
  window.append(digit);
  parent.append(window);
  return digit;
}

// Keep the actual button and its focus when digits roll; only the glyph moves.
function setDigit(digit, next, direction) {
  const old = digit.textContent;
  if (old === next) return;
  const window = digit.parentElement;
  window.querySelector('.wheel-old')?.remove();
  digit.getAnimations().forEach(animation => animation.cancel());
  digit.textContent = next;
  if (!direction || !old || reducedMotion.matches) return;

  const previous = element('span', 'wheel-old', old);
  window.append(previous);
  const duration = Math.min(230, Number(speed.value) * 0.8);
  const timing = { duration, easing: 'cubic-bezier(.2,.68,.3,1)' };
  const offset = direction * 100;
  digit.animate([{ transform: 'translateY(' + offset + '%)' }, { transform: 'translateY(0)' }], timing);
  const outgoing = previous.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(' + -offset + '%)' }], timing);
  outgoing.onfinish = () => previous.remove();
}

function makeNibble(key, label, topPower) {
  const group = element('div', 'nibble');
  group.dataset.nibble = key;
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  group.append(element('div', 'nibble-label', label));
  const row = element('div', 'wheel-row');
  const bits = [];
  for (let i = 0; i < 4; i++) {
    const power = topPower - i;
    const weight = power < 0 ? '1/' + 2 ** -power : String(2 ** power);
    const column = element('div', 'wheel-column');
    const button = element('button', 'bit-wheel');
    button.type = 'button';
    button.dataset.power = power;
    button.setAttribute('aria-label', weight + ' place');
    button.title = 'Flip the ' + weight + ' place';
    const digit = wheelDigit(button);
    column.append(button, element('span', 'place-weight', weight));
    row.append(column);
    bits.push({ mask: 2 ** (power + 4), weight, button, digit });
  }
  const sum = element('div', 'nibble-sum');
  const sumTerms = bits.map((bit, i) => {
    if (i > 0) sum.append(element('span', 'sum-plus', ' + '));
    const term = element('span', 'sum-term');
    sum.append(term);
    return term;
  });
  const hexRow = element('div', 'hex-row');
  const hexWheel = element('span', 'hex-wheel');
  const hexDigit = wheelDigit(hexWheel);
  hexRow.setAttribute('role', 'group');
  hexRow.append(hexWheel);
  group.append(row, sum, hexRow);
  register.append(group);
  return { key, group, bits, sumTerms, hexRow, hexDigit };
}

const high = makeNibble('high', 'Sixteens', 7);
const low = makeNibble('low', 'Ones', 3);
const point = element('div', 'radix-point', '.');
point.setAttribute('aria-label', 'Binary point');
register.append(point);
const fraction = makeNibble('fraction', 'Sixteenths', -1);
const groups = [high, low, fraction];

function render(direction = 0) {
  register.classList.toggle('show-hex', hexadecimal.checked);
  register.classList.toggle('show-fractions', fractional.checked);
  fraction.group.hidden = point.hidden = !fractional.checked;
  byId('hex-key').hidden = !hexadecimal.checked;
  const allTerms = [];
  for (const { key, group, bits, sumTerms, hexRow, hexDigit } of groups) {
    let nibble = 0;
    const terms = [];
    for (const {mask, weight, button, digit} of bits) {
      const bit = (units & mask) !== 0;
      nibble = 2 * nibble + Number(bit);
      terms.push(bit ? weight : '0');
      button.setAttribute('aria-pressed', String(bit));
      setDigit(digit, bit ? '1' : '0', group.hidden ? 0 : direction);
    }
    sumTerms.forEach((term, i) => { term.textContent = terms[i]; });
    const hex = nibble.toString(16).toUpperCase();
    group.dataset.value = nibble;
    hexRow.hidden = !hexadecimal.checked;
    hexRow.setAttribute('aria-label', 'Hexadecimal digit ' + hex);
    setDigit(hexDigit, hex, hexRow.hidden || group.hidden ? 0 : direction);
    if (!group.hidden && (key !== 'high' || nibble !== 0)) allTerms.push(...terms);
  }
  byId('sum').textContent = allTerms.join(' + ');
  byId('decimal').textContent = fractional.checked ? String(units / 16) : String(Math.floor(units / 16));
  byId('stride').textContent = fractional.checked ? '1/16' : '1';
}

function announceValue() {
  byId('announcement').textContent = 'Decimal value ' + byId('decimal').textContent + '.';
}

function step(direction) {
  const increment = fractional.checked ? 1 : 16;
  units = (units + direction * increment + modulus) % modulus;
  render(direction);
}

function stop() {
  clearInterval(timer);
  timer = null;
  play.setAttribute('aria-pressed', 'false');
  byId('play-text').textContent = 'Play count';
}

play.addEventListener('click', () => {
  if (timer !== null) {
    stop();
    return;
  }
  step(1);
  timer = setInterval(() => step(1), Number(speed.value));
  play.setAttribute('aria-pressed', 'true');
  byId('play-text').textContent = 'Pause';
});

speed.addEventListener('change', () => {
  if (timer === null) return;
  clearInterval(timer);
  timer = setInterval(() => step(1), Number(speed.value));
});

byId('next').addEventListener('click', () => { stop(); step(1); announceValue(); });
byId('prev').addEventListener('click', () => { stop(); step(-1); announceValue(); });
byId('zero').addEventListener('click', () => { stop(); units = 0; render(); announceValue(); });
fractional.addEventListener('change', () => render());
hexadecimal.addEventListener('change', () => render());

register.addEventListener('click', event => {
  const button = event.target.closest('.bit-wheel');
  if (!button) return;
  stop();
  const mask = 2 ** (Number(button.dataset.power) + 4);
  units ^= mask;
  render((units & mask) ? 1 : -1);
  announceValue();
});

register.addEventListener('keydown', event => {
  const button = event.target.closest('.bit-wheel');
  if (!button || event.ctrlKey || event.metaKey || event.altKey) return;
  const buttons = groups.filter(group => !group.group.hidden)
    .flatMap(group => group.bits.map(bit => bit.button));
  const index = buttons.indexOf(button);
  if (event.key === '0' || event.key === '1') {
    event.preventDefault();
    stop();
    const mask = 2 ** (Number(button.dataset.power) + 4);
    units = event.key === '1' ? units | mask : units & ~mask;
    render(event.key === '1' ? 1 : -1);
    announceValue();
    buttons[Math.min(index + 1, buttons.length - 1)].focus();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    buttons[Math.max(0, Math.min(index + direction, buttons.length - 1))].focus();
  }
});

for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', () => {
    stop();
    const isFraction = button.dataset.example === 'fraction';
    units = isFraction ? 170 : 240;
    fractional.checked = isFraction;
    render();
    byId('counter-title').focus({ preventScroll: true });
    byId('counter').scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    announceValue();
  });
}

document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
stop();
render();
