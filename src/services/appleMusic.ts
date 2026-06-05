export interface AppleMusicSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist?: string;
  duration: number;
  artworkUrl?: string;
  catalogId?: string;
  libraryId?: string;
}

export interface AppleMusicPlaylist {
  id: string;
  name: string;
  description?: string;
  artworkUrl?: string;
  trackCount?: number;
  canEdit?: boolean;
}

interface AppleMusicAttributes {
  name?: string;
  artistName?: string;
  albumName?: string;
  albumArtistName?: string;
  durationInMillis?: number;
  description?: {
    standard?: string;
    short?: string;
  };
  canEdit?: boolean;
  trackCount?: number;
  artwork?: {
    url?: string;
    width?: number;
    height?: number;
  };
  playParams?: {
    id?: string;
    kind?: string;
    catalogId?: string;
  };
}

interface AppleMusicResource {
  id: string;
  type: string;
  attributes?: AppleMusicAttributes;
}

interface AppleMusicSearchResponse {
  results?: Record<string, { data?: AppleMusicResource[] }>;
}

interface AppleMusicListResponse {
  data?: AppleMusicResource[];
  next?: string;
}

interface DeveloperTokenResponse {
  developerToken?: string;
  token?: string;
}

export class AppleMusicConfigError extends Error {}

const API_BASE = 'https://api.music.apple.com/v1';

const artworkUrl = (url?: string) => {
  if (!url) return undefined;
  return url
    .replace(/^http:\/\//, 'https://')
    .replaceAll('{w}', '600')
    .replaceAll('{h}', '600');
};

const mapSong = (resource: AppleMusicResource): AppleMusicSong => {
  const attributes = resource.attributes || {};
  const catalogId = resource.type === 'songs'
    ? resource.id
    : attributes.playParams?.catalogId || attributes.playParams?.id;

  return {
    id: resource.id,
    title: attributes.name || 'Unknown Song',
    artist: attributes.artistName || 'Unknown Artist',
    album: attributes.albumName || 'Unknown Album',
    albumArtist: attributes.albumArtistName,
    duration: Math.max(1, Math.round((attributes.durationInMillis || 0) / 1000)),
    artworkUrl: artworkUrl(attributes.artwork?.url),
    catalogId,
    libraryId: resource.type === 'library-songs' ? resource.id : undefined,
  };
};

const mapPlaylist = (resource: AppleMusicResource): AppleMusicPlaylist => {
  const attributes = resource.attributes || {};

  return {
    id: resource.id,
    name: attributes.name || 'Untitled Playlist',
    description: attributes.description?.standard || attributes.description?.short,
    artworkUrl: artworkUrl(attributes.artwork?.url),
    trackCount: attributes.trackCount,
    canEdit: attributes.canEdit,
  };
};

export class AppleMusicClient {
  private developerToken?: string;
  private userToken?: string;

  constructor(
    initialUserToken = import.meta.env.VITE_APPLE_MUSIC_USER_TOKEN,
    private readonly storefront = import.meta.env.VITE_APPLE_MUSIC_STOREFRONT || 'us',
    private readonly tokenEndpoint = import.meta.env.VITE_APPLE_MUSIC_TOKEN_ENDPOINT
      || 'http://127.0.0.1:18787/apple-music/developer-token',
  ) {
    this.userToken = initialUserToken || undefined;
  }

  get hasUserToken() {
    return Boolean(this.userToken);
  }

  setUserToken(userToken: string) {
    this.userToken = userToken || undefined;
  }

  get defaultSearchTerm() {
    return import.meta.env.VITE_APPLE_MUSIC_DEFAULT_SEARCH || 'Daft Punk';
  }

  async isConfigured() {
    try {
      await this.getDeveloperToken();
      return true;
    } catch {
      return false;
    }
  }

  async searchCatalog(term = this.defaultSearchTerm, limit = 12) {
    const response = await this.request<AppleMusicSearchResponse>(
      `/catalog/${this.storefront}/search?term=${encodeURIComponent(term)}&types=songs&limit=${limit}`,
      false,
    );

    return response.results?.songs?.data?.map(mapSong) || [];
  }

  async searchLibrary(term = this.defaultSearchTerm, limit = 12) {
    const response = await this.request<AppleMusicSearchResponse>(
      `/me/library/search?term=${encodeURIComponent(term)}&types=library-songs&limit=${limit}`,
      true,
    );

    return response.results?.['library-songs']?.data?.map(mapSong) || [];
  }

  async getLibrarySongs(limit = 25) {
    const resources = await this.requestAllPages(`/me/library/songs?limit=${limit}`, true);
    return resources
      .filter(resource => resource.type === 'library-songs')
      .map(mapSong);
  }

  async getLibraryPlaylists(limit = 100) {
    const resources = await this.requestAllPages(`/me/library/playlists?limit=${limit}`, true);
    return resources
      .filter(resource => resource.type === 'library-playlists')
      .map(mapPlaylist);
  }

  async getPlaylistTracks(playlistId: string, limit = 100) {
    const resources = await this.requestAllPages(
      `/me/library/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${limit}`,
      true,
    );

    return resources
      .filter(resource => resource.type === 'library-songs' || resource.type === 'songs')
      .map(mapSong);
  }

  async addSongToLibrary(catalogSongId: string) {
    await this.request('/me/library', true, {
      method: 'POST',
      body: JSON.stringify({
        ids: {
          songs: [catalogSongId],
        },
      }),
    });
  }

  async addSongToFavorites(songId: string) {
    await this.request(`/me/favorites?ids[songs]=${encodeURIComponent(songId)}`, true, {
      method: 'POST',
    });
  }

  async createPlaylist(name = 'SquarePod') {
    const response = await this.request<{ data?: AppleMusicResource[] }>('/me/library/playlists', true, {
      method: 'POST',
      body: JSON.stringify({
        attributes: {
          name,
          description: 'Managed from SquarePod.',
        },
      }),
    });

    return response.data?.[0]?.id;
  }

  async getDeveloperToken() {
    if (this.developerToken) return this.developerToken;

    const envToken = import.meta.env.VITE_APPLE_MUSIC_DEVELOPER_TOKEN;
    if (envToken) {
      this.developerToken = envToken;
      return envToken;
    }

    if (!this.tokenEndpoint) {
      throw new AppleMusicConfigError('Missing Apple Music developer token endpoint.');
    }

    const response = await fetch(this.tokenEndpoint);
    if (!response.ok) {
      throw new Error(`Developer token request failed: ${response.status}`);
    }

    const data = await response.json() as DeveloperTokenResponse;
    const token = data.developerToken || data.token;
    if (!token) {
      throw new Error('Developer token endpoint returned no token.');
    }

    this.developerToken = token;
    return token;
  }

  private async requestAllPages(path: string, requiresUserToken: boolean) {
    const resources: AppleMusicResource[] = [];
    let nextPath: string | undefined = path;

    while (nextPath) {
      const response = await this.request<AppleMusicListResponse>(nextPath, requiresUserToken);
      resources.push(...(response.data || []));
      nextPath = response.next;
    }

    return resources;
  }

  private async request<T>(path: string, requiresUserToken: boolean, init: RequestInit = {}): Promise<T> {
    const developerToken = await this.getDeveloperToken();
    if (requiresUserToken && !this.userToken) {
      throw new AppleMusicConfigError('Missing Apple Music user token.');
    }

    const requestUrl = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : path.startsWith('/v1/')
        ? `https://api.music.apple.com${path}`
        : `${API_BASE}${path}`;

    const response = await fetch(requestUrl, {
      ...init,
      headers: {
        Authorization: `Bearer ${developerToken}`,
        ...(requiresUserToken ? { 'Music-User-Token': this.userToken || '' } : {}),
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Apple Music API failed for ${path}: ${response.status} ${text}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }
}
