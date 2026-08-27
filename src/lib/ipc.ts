import { invoke } from '@tauri-apps/api/core'

export interface LibraryRoot {
  id: string
  label: string
  path: string
}

export interface Config {
  operator_mode: boolean
  library_roots: LibraryRoot[]
  has_igdb: boolean
  has_steamgriddb: boolean
}

export type MatchStatus = 'unmatched' | 'auto' | 'manual' | 'none'

export interface Game {
  id: number
  title: string
  root_id: string
  rel_path: string
  launch_type: string
  abs_path: string | null
  available: boolean
  summary: string | null
  genres: string | null
  release_year: number | null
  developer: string | null
  cover_path: string | null
  hero_path: string | null
  match_status: MatchStatus
  emulator_profile_id: number | null
  media_path: string | null
  custom_exe: string | null
  custom_args: string | null
  custom_workdir: string | null
}

export interface ScanCandidate {
  rel_path: string
  suggested_title: string
}

export interface MetaHit {
  igdb_id: number
  name: string
  summary: string | null
  genres: string | null
  release_year: number | null
  developer: string | null
  cover_url: string | null
}

export interface EmulatorProfile {
  id: number | null
  name: string
  kind: 'pcsx2' | 'rpcs3' | 'custom'
  exe_path: string
  default_args: string
}

export interface RootStatus {
  id: string
  available: boolean
}

export const ipc = {
  getConfig: () => invoke<Config>('get_config'),
  setOperatorMode: (enabled: boolean) => invoke<void>('set_operator_mode', { enabled }),
  setCredentials: (c: {
    igdbClientId?: string
    igdbClientSecret?: string
    steamgriddbKey?: string
  }) =>
    invoke<Config>('set_credentials', {
      igdbClientId: c.igdbClientId ?? null,
      igdbClientSecret: c.igdbClientSecret ?? null,
      steamgriddbKey: c.steamgriddbKey ?? null,
    }),

  addLibraryRoot: (path: string) => invoke<LibraryRoot>('add_library_root', { path, label: null }),
  removeLibraryRoot: (id: string) => invoke<void>('remove_library_root', { id }),
  relinkRoot: (id: string, newPath: string) => invoke<void>('relink_root', { id, newPath }),
  checkRoots: () => invoke<RootStatus[]>('check_library_roots'),

  scanCandidates: (rootId: string) => invoke<ScanCandidate[]>('scan_candidates', { rootId }),
  importGames: (rootId: string, items: { rel_path: string; title: string }[]) =>
    invoke<number>('import_games', { rootId, items }),

  listGames: () => invoke<Game[]>('list_games'),
  removeGame: (id: number) => invoke<void>('remove_game', { id }),
  launchGame: (id: number) => invoke<void>('launch_game', { id }),
  openGameLocation: (id: number) => invoke<void>('open_game_location', { id }),
  getDataDir: () => invoke<string>('get_data_dir'),
  imageDataUrl: (rel: string) => invoke<string>('image_data_url', { rel }),
  importLocalImage: (gameId: number, kind: 'cover' | 'hero', srcPath: string) =>
    invoke<string>('import_local_image', { gameId, kind, srcPath }),
  portablizePath: (absPath: string) => invoke<string>('portablize_path', { absPath }),

  searchMetadata: (query: string) => invoke<MetaHit[]>('search_metadata', { query }),
  applyMetadata: (gameId: number, igdbId: number, auto = false) =>
    invoke<MetaHit>('apply_metadata', { gameId, igdbId, auto }),
  autoMatch: (gameId: number) => invoke<MetaHit | null>('auto_match', { gameId }),
  fetchArtwork: (gameId: number, rename = true) =>
    invoke<boolean>('fetch_artwork', { gameId, rename }),
  setGameFields: (
    gameId: number,
    fields: {
      title?: string
      summary?: string
      genres?: string
      release_year?: number
      developer?: string
      cover_url?: string
      hero_url?: string
    },
  ) =>
    invoke<void>('set_game_fields', {
      gameId,
      title: fields.title ?? null,
      summary: fields.summary ?? null,
      genres: fields.genres ?? null,
      releaseYear: fields.release_year ?? null,
      developer: fields.developer ?? null,
      coverUrl: fields.cover_url ?? null,
      heroUrl: fields.hero_url ?? null,
    }),

  listProfiles: () => invoke<EmulatorProfile[]>('list_profiles'),
  saveProfile: (profile: EmulatorProfile) => invoke<number>('save_profile', { profile }),
  deleteProfile: (id: number) => invoke<void>('delete_profile', { id }),
  setGameLaunch: (
    gameId: number,
    launchType: string,
    opts: {
      profileId?: number | null
      mediaPath?: string | null
      customExe?: string | null
      customArgs?: string | null
      customWorkdir?: string | null
    } = {},
  ) =>
    invoke<void>('set_game_launch', {
      gameId,
      launchType,
      profileId: opts.profileId ?? null,
      mediaPath: opts.mediaPath ?? null,
      customExe: opts.customExe ?? null,
      customArgs: opts.customArgs ?? null,
      customWorkdir: opts.customWorkdir ?? null,
    }),
}
