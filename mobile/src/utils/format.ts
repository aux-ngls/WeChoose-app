export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (elapsedSeconds < 45) {
    return "À l’instant";
  }
  if (elapsedSeconds < 3600) {
    return `Il y a ${Math.floor(elapsedSeconds / 60)} min`;
  }
  if (elapsedSeconds < 86400) {
    return `Il y a ${Math.floor(elapsedSeconds / 3600)} h`;
  }
  if (elapsedSeconds < 86400 * 7) {
    const days = Math.floor(elapsedSeconds / 86400);
    return `Il y a ${days} j`;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}
