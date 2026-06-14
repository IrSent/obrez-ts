// Linear interpolation strategy for SoundTouch
// Registers 'linear' as a standalone strategy id in the processor's registry.
(function () {
  const linearStrategy = {
    id: 'linear',
    baseStrategy: 'linear',
    kernel: null, // no kernel = use built-in linear
  };

  if (typeof registerBuiltInInterpolationStrategy === 'function') {
    registerBuiltInInterpolationStrategy(linearStrategy);
  } else if (typeof registerInterpolationStrategy === 'function') {
    registerInterpolationStrategy(linearStrategy);
  }
})();
