function routeOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

/** Preserve only a same-origin App route; the ephemeral Harness port is never retained. */
export function appWindowRecoveryRoute(url: string, baseUrl: string): string | undefined {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    return parsed.origin === base.origin ? routeOf(parsed.href) : undefined;
  } catch {
    return undefined;
  }
}

/** Rebind one captured App route to a newly started same-origin Harness server. */
export function appWindowRecoveryUrl(baseUrl: string, route: string): string | undefined {
  if (!route.startsWith("/") || route.startsWith("//")) return undefined;
  try {
    const base = new URL(baseUrl);
    const target = new URL(route, base);
    return target.origin === base.origin ? target.href : undefined;
  } catch {
    return undefined;
  }
}

export function sameAppWindowRoute(url: string, route: string): boolean {
  return routeOf(url) === route;
}
