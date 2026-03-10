export const WATCH_LATER_PLAYLIST_ID = -1;
export const FAVORITES_PLAYLIST_ID = -2;
export const HISTORY_PLAYLIST_ID = -3;

export interface PlaylistSummary {
  id: number;
  name: string;
  type: "custom" | "system";
  system_key: "watch-later" | "favorites" | "history" | null;
  readonly: boolean;
}

export function canAddToPlaylist(playlist: PlaylistSummary): boolean {
  return !playlist.readonly;
}
