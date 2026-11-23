// The sign is fixed at zero. A code is the remaining exponent and fraction
// fields read as one unsigned integer, so finite codes are in numerical order.
export function makeFormat(e, m) {
  if (!Number.isInteger(e) || e < 2 || e > 5 ||
      !Number.isInteger(m) || m < 1 || m > 6) {
    throw new RangeError('Choose 2–5 exponent bits and 1–6 fraction bits.');
  }

  const bias = 2 ** (e - 1) - 1;
  const fractionCount = 2 ** m;
  const maxExponentField = 2 ** e - 1;
  const infinityCode = maxExponentField * fractionCount;
  const minNormal = 2 ** (1 - bias);
  const largestPower = 2 ** (maxExponentField - 1 - bias);
  const maxFinite = (2 - 1 / fractionCount) * largestPower;
  const format = {
    e, m, bias, fractionCount, maxExponentField, infinityCode, minNormal, maxFinite,
    maxFiniteCode: infinityCode - 1,
    nanCode: infinityCode + 1,
    minNormalCode: fractionCount,
    oneCode: bias * fractionCount,
    nextAfterOneCode: bias * fractionCount + 1,
    minSubnormal: minNormal / fractionCount,
    epsilon: 1 / fractionCount,
    overflowThreshold: maxFinite + largestPower / (2 * fractionCount),
  };
  format.epsilonCode = roundToCode(format.epsilon, format);
  return format;
}

function finiteValue(exponentField, fractionField, format) {
  if (exponentField === 0) return fractionField * format.minSubnormal;
  return (1 + fractionField / format.fractionCount) * 2 ** (exponentField - format.bias);
}

export function decode(code, format) {
  if (!Number.isInteger(code) || code < 0 || code >= 2 ** (format.e + format.m)) {
    throw new RangeError('Bit pattern is outside the selected format.');
  }
  const exponentField = Math.floor(code / format.fractionCount);
  const fractionField = code % format.fractionCount;
  const exponentBits = exponentField.toString(2).padStart(format.e, '0');
  const fractionBits = fractionField.toString(2).padStart(format.m, '0');
  const fields = { code, exponentField, fractionField, exponentBits, fractionBits,
    word: '0' + exponentBits + fractionBits };

  if (exponentField === format.maxExponentField) {
    const infinity = fractionField === 0;
    return { ...fields, kind: infinity ? 'infinity' : 'nan',
      exponent: null, leading: null, significand: null, value: infinity ? Infinity : NaN };
  }

  const leading = exponentField === 0 ? 0 : 1;
  const exponent = (exponentField || 1) - format.bias;
  const significand = leading + fractionField / format.fractionCount;
  let kind = 'normal';
  if (exponentField === 0) kind = fractionField === 0 ? 'zero' : 'subnormal';
  return { ...fields, kind, exponent, leading, significand,
    value: finiteValue(exponentField, fractionField, format) };
}

// Round the positive half-line to nearest, choosing an even low bit at ties.
// Every value and midpoint in the supported formats is exact in JavaScript.
export function roundToCode(x, format) {
  if (typeof x !== 'number') throw new TypeError('Expected a number.');
  if (Number.isNaN(x)) return format.nanCode;
  if (x <= 0) return 0;
  if (x >= format.overflowThreshold) return format.infinityCode;
  if (x >= format.maxFinite) return format.maxFiniteCode;

  const valueAt = code => finiteValue(
    Math.floor(code / format.fractionCount), code % format.fractionCount, format
  );
  let lower = 0;
  let upper = format.maxFiniteCode;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (x < valueAt(middle)) upper = middle;
    else lower = middle;
  }
  const midpoint = (valueAt(lower) + valueAt(upper)) / 2;
  if (x === midpoint) return lower % 2 === 0 ? lower : upper;
  return x < midpoint ? lower : upper;
}
