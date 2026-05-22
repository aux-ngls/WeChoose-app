export const STREAMING_SERVICE_OPTIONS = [
  'Netflix',
  'Prime Video',
  'Disney+',
  'Canal+',
  'Apple TV+',
  'Max',
  'Paramount+',
  'OCS',
  'MUBI',
  'ARTE',
] as const;

export function normalizeStreamingServiceName(value: string) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '';
  }

  const aliases: Record<string, string> = {
    prime: 'Prime Video',
    'amazon prime': 'Prime Video',
    'amazon prime video': 'Prime Video',
    'prime video': 'Prime Video',
    'disney+': 'Disney+',
    'disney plus': 'Disney+',
    netflix: 'Netflix',
    'canal+': 'Canal+',
    'canal plus': 'Canal+',
    'apple tv+': 'Apple TV+',
    'apple tv plus': 'Apple TV+',
    'paramount+': 'Paramount+',
    'paramount plus': 'Paramount+',
    max: 'Max',
    ocs: 'OCS',
    mubi: 'MUBI',
    arte: 'ARTE',
    'arte.tv': 'ARTE',
    'arte tv': 'ARTE',
  };

  return aliases[normalized.toLowerCase()] ?? normalized;
}

export function matchesOwnedStreamingServices(
  movieProviderNames: string[] | undefined,
  ownedStreamingServices: string[],
) {
  if (!ownedStreamingServices.length) {
    return true;
  }

  const ownedSet = new Set(ownedStreamingServices.map(normalizeStreamingServiceName).filter(Boolean));
  return (movieProviderNames ?? []).some((providerName) => ownedSet.has(normalizeStreamingServiceName(providerName)));
}
