import got, { Options as GotOptions, Method, CancelableRequest } from "got";

export default class SpotifyApiHelper {
    private accessToken: string;
    private baseRequestOptions: { headers: { Authorization: string } };

    constructor(accessToken: string) {
        this.accessToken = accessToken;

        this.baseRequestOptions = {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        };
    }

    private async request(
        endpoint: string,
        method: Method,
        headers?: Record<string, string | string[]>,
        body?: { [key: string]: string | number | boolean },
        query?: { [key: string]: string | number | boolean },
        options?: GotOptions
    ): Promise<{ [key: string]: any }> {
        const response = await got(`https://api.spotify.com/v1${endpoint}`, {
            ...options,
            method: method,
            headers: {
                ...headers,
                ...this.baseRequestOptions.headers,
            },
            json: body,
            searchParams: query,
            responseType: "json",
        });

        //@ts-ignore
        return response.body;
    }

    async getPlaylists(
        limit?: number,
        offset?: number
    ): Promise<SpotifyPagingObject<SpotifyPlaylist>> {
        const data = await this.request(
            "/me/playlists",
            "GET",
            undefined,
            undefined,
            {
                limit,
                offset,
            }
        );

        return data as any;
    }

    async getSongsFromPlaylist(
        playlistId: string,
        fields?: string,
        limit?: number,
        offset?: number
    ): Promise<SpotifyPagingObject<SpotifyPlaylistTrack>> {
        const data = await this.request(
            `/playlists/${playlistId}/tracks`,
            "GET",
            undefined,
            undefined,
            {
                fields,
                limit,
                offset,
            }
        );

        return data as any;
    }

    /**
     * Max 100 ids
     */
    async getSongAnalysis(
        songIds: string[]
    ): Promise<{ audio_features: SpotifyAudioFeatures[] }> {
        const data = await this.request(
            "/audio-features",
            "GET",
            undefined,
            undefined,
            {
                ids: songIds.join(","),
            }
        );

        return data as any;
    }
}

// https://developer.spotify.com/documentation/web-api/reference/object-model/#paging-object
export interface SpotifyPagingObject<T> {
    href: string;
    items: T[];
    limit: number;
    next: string | null;
    offset: number;
    previous: string | null;
    total: number;
}

// https://developer.spotify.com/documentation/web-api/reference/playlists/get-a-list-of-current-users-playlists/#playlist-object-simplified
export interface SpotifyPlaylist {
    collaborative: boolean;
    description: string;
    // external_urls: undefined;
    href: string;
    id: string;
    // images: undefined;
    name: string;
    owner: SpotifyUser;
    public: boolean | null;
    snapshot_id: string;
    // tracks: undefined;
    type: "playlist";
    uri: string;
}

// https://developer.spotify.com/documentation/web-api/reference/object-model/#user-object-public
export interface SpotifyUser {
    display_name: string;
    // external_urls: undefined;
    // followers: undefined;
    href: string;
    id: string;
    // images: undefined;
    type: "user";
    uri: string;
}

// https://developer.spotify.com/documentation/web-api/reference/playlists/get-playlists-tracks/#playlist-track-object
export interface SpotifyPlaylistTrack {
    added_at: string | null;
    added_by: SpotifyUser | null;
    is_local: boolean;
    track: SpotifyTrack;
}

// https://developer.spotify.com/documentation/web-api/reference/object-model/#track-object-full
export interface SpotifyTrack {
    // album: undefined;
    artists: SpotifyArtist[];
    // available_markets: undefined;
    // disc_number: undefined;
    duration_ms: number;
    explicit: boolean;
    // external_ids: undefined;
    // external_urls: undefined;
    href: string;
    id: string;
    is_playable: boolean;
    // linked_from: undefined;
    // restrictions: undefined;
    name: string;
    popularity: number;
    preview_url: string;
    track_number: number;
    type: string;
    uri: string;
    is_local: boolean;
}

// https://developer.spotify.com/documentation/web-api/reference/object-model/#audio-features-object
export interface SpotifyAudioFeatures {
    acousticness: number;
    analysis_url: string;
    danceability: number;
    duration_ms: number;
    energy: number;
    id: string;
    instrumentalness: number;
    /**
     * Use SpotifyKey struct
     */
    key: number;
    liveness: number;
    loudness: number;
    /**
     * Use SpotifyMode struct
     */
    mode: number;
    speechiness: number;
    tempo: number;
    time_signature: number;
    track_href: number;
    type: string;
    uri: string;
    valence: number;
}

// https://developer.spotify.com/documentation/web-api/reference/object-model/#artist-object-simplified
export interface SpotifyArtist {
    // external_urls: undefined;
    href: string;
    id: string;
    name: string;
    type: "artist";
    uri: string;
}

export class SpotifyKey {
    static C = 0;
    static CSharp = 1;
    static DFlat = 1;
    static D = 2;
    static DSharp = 3;
    static EFlat = 3;
    static E = 4;
    static F = 5;
    static FSharp = 6;
    static GFlat = 6;
    static G = 7;
    static GSharp = 8;
    static AFlat = 8;
    static A = 9;
    static ASharp = 10;
    static BFlat = 10;
    static B = 11;

    private keyMap = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
    ];

    key: string;

    constructor(id: number) {
        this.key = this.keyMap[id];
    }
}

export class SpotifyMode {
    static Major = 1;
    static Minor = 0;

    private modeMap = ["Minor", "Major"];

    mode: string;

    constructor(id: number) {
        this.mode = this.modeMap[id];
    }
}
