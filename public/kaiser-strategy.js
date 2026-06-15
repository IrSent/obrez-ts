const KAISER_DEFAULT_PARAMS = {
  zeroCrossings: 4,
  beta: 8.6,
  normalize: false,
  windowPower: 1,
};
function normalizeKaiserParams(params, defaults) {
  const merged = {
    ...defaults,
    ...(params ?? {}),
  };
  const zeroCrossings = Math.max(2, Math.min(16, Math.round(Number(merged['zeroCrossings'] ?? defaults['zeroCrossings'] ?? 4))));
  const beta = Math.max(0, Math.min(20, Number(merged['beta'] ?? 8.6)));
  const normalize = Boolean(merged['normalize']);
  const windowPower = Math.max(0.1, Number(merged['windowPower'] ?? 1));
  return { zeroCrossings, beta, normalize, windowPower };
}
function applyKaiserParams(state, params) {
  if (typeof state !== 'object' || state === null) {
    return;
  }
  const record = state;
  record.params = {
    zeroCrossings: Math.max(2, Math.round(Number(params['zeroCrossings'] ?? 4))),
    beta: Math.max(0, Math.min(20, Number(params['beta'] ?? 8.6))),
    normalize: Boolean(params['normalize']),
    windowPower: Math.max(0.1, Number(params['windowPower'] ?? 1)),
  };
}
function readFrameSample(src, srcOffset, numFrames, frameIndex, channel, state) {
  if (frameIndex < 0) {
    return channel === 0 ? state.prevSampleL : state.prevSampleR;
  }
  if (frameIndex >= numFrames) {
    const edgeIndex = srcOffset + 2 * (numFrames - 1) + channel;
    return src[edgeIndex];
  }
  return src[srcOffset + 2 * frameIndex + channel];
}
function normalizedSinc(x) {
  if (x === 0) {
    return 1;
  }
  const value = Math.PI * x;
  return Math.sin(value) / value;
}
function besselI0(x) {
  const halfSquared = (x * x) / 4;
  let sum = 1;
  let term = 1;
  for (let index = 1; index <= 32; index += 1) {
    term *= halfSquared / (index * index);
    sum += term;
    if (term < 1e-12) {
      break;
    }
  }
  return sum;
}
function kaiserWindow(distance, radius, beta, denominator, windowPower) {
  const absDistance = Math.abs(distance);
  if (absDistance >= radius) {
    return 0;
  }
  if (beta === 0) {
    return 1;
  }
  const ratio = absDistance / radius;
  const shape = Math.sqrt(1 - ratio * ratio);
  const base = besselI0(beta * shape) / denominator;
  return Math.pow(base, windowPower);
}
export const kaiserKernel = (src, srcOffset, numFrames, position, channel, state) => {
  const kernelState = state;
  const { zeroCrossings, beta, normalize, windowPower } = kernelState.params;
  const radius = zeroCrossings;
  const denominator = besselI0(beta);
  const power = typeof windowPower === 'number' ? windowPower : 1;
  const center = Math.floor(position);
  const start = center - (radius - 1);
  const end = center + radius;
  let numerator = 0;
  let weightSum = 0;
  for (let sampleIndex = start; sampleIndex <= end; sampleIndex += 1) {
    const distance = position - sampleIndex;
    const window = kaiserWindow(distance, radius, beta, denominator, power);
    const weight = normalizedSinc(distance) * window;
    numerator +=
      readFrameSample(src, srcOffset, numFrames, sampleIndex, channel, kernelState) * weight;
    weightSum += weight;
  }
  if (Math.abs(weightSum) < 1e-12) {
    return readFrameSample(src, srcOffset, numFrames, Math.round(position), channel, kernelState);
  }
  return normalize ? numerator / weightSum : numerator / (weightSum || 1);
};
kaiserKernel.createState = () => ({
  prevSampleL: 0,
  prevSampleR: 0,
  params: { ...KAISER_DEFAULT_PARAMS },
});
export const kaiserStrategy = {
  id: 'kaiser',
  baseStrategy: 'linear',
  kernel: kaiserKernel,
  defaultParams: KAISER_DEFAULT_PARAMS,
  normalizeParams: normalizeKaiserParams,
  applyParams: applyKaiserParams,
};
export function registerKaiserStrategy(registry) {
  registry.registerInterpolationStrategy(kaiserStrategy);
}
// Self-register: strategyRegistry is exposed on AudioWorkletGlobalScope by
// soundtouch-processor.js. Register during module evaluation so kaiser is
// available before the SoundTouchProcessor is instantiated.
if (globalThis._strategyRegistry) {
  globalThis._strategyRegistry.set(kaiserStrategy.id, kaiserStrategy);
}
//# sourceMappingURL=index.js.map