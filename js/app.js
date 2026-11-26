// Uygulama düzeyi: yönlendirme ve sayfalar arası veri aktarımı
export const bus = { params: {}, rerender: null };

export function go(route, params = {}) {
  bus.params[route] = params;
  if (location.hash === '#' + route) { bus.rerender && bus.rerender(); }
  else location.hash = route;
}

export function takeParams(route) {
  const p = bus.params[route] || {};
  delete bus.params[route];
  return p;
}

export function refresh() { bus.rerender && bus.rerender(); }
