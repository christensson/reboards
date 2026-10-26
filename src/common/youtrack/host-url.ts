/**
 * Base URL of the YouTrack installation that hosts this widget.
 * Widgets are served from <base>/api/... so the path before "/api/" is the base;
 * the referrer (the YouTrack page embedding the iframe) is the fallback.
 */
export const resolveBaseUrl = (href: string, referrer: string, origin: string): string => {
  const fromHref = href.match(/^(https?:\/\/[^?#]*?)\/api\//);
  if (fromHref) {
    return fromHref[1];
  }
  const fromReferrer = referrer.match(/^(https?:\/\/[^?#]*?)\/(app|apps|issue|issues|agiles|dashboard|projects|admin)(\/|$|\?)/);
  if (fromReferrer) {
    return fromReferrer[1];
  }
  return origin === 'null' ? '' : origin.replace(/\/$/, '');
};
