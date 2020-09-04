import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import handlebars from "express-handlebars";
import helpers, {  } from "handlebars-helpers";
import dotenv from "dotenv";
import path from "path";
import SpotifyApi, { SpotifyKey, SpotifyMode, SpotifyTrack, SpotifyPlaylist, SpotifyAudioFeatures, SpotifyPlaylistTrack } from "./structs/SpotifyApiHelper";

dotenv.config();

const app = express();

app.engine("handlebars", handlebars({
    helpers: helpers()
}));

app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

app.use(
    session({
        secret: process.env["SESSION_SECRET"],
        resave: true,
        saveUninitialized: true,
        cookie: { secure: false },
    })
);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
/*app.use((req, res, next) => {
    if (process.env["NODE_ENV"] != "production") {
        console.log(req.session);
        console.log(req.method, req.path);
        console.log("Query", req.query);
        console.log("Body", req.body);
        console.log("===============================");
    }

    next();
});*/

app.get("/", (req, res) => {
    res.redirect("/auth");
});

app.get("/auth", async (req, res) => {
    req.session.regenerate((err) => {
        const authUrl = new URL("https://accounts.spotify.com/authorize");
        authUrl.searchParams.append("client_id", process.env["SPOTIFY_CLIENT_ID"]);
        authUrl.searchParams.append("response_type", "token");
        authUrl.searchParams.append("redirect_uri", process.env["SPOTIFY_CALLBACK_URL"]);
        authUrl.searchParams.append("scope", "user-read-email playlist-read-collaborative playlist-modify-public playlist-read-private playlist-modify-private");

        res.redirect(authUrl.href);
    });
});

app.get("/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
        res.redirect("/");
    });
});

app.get("/auth/callback", async (req, res) => {
    const error = req.query["error"];

    if (error !== undefined) {
        return res.redirect("/auth/fail?error=" + error);
    }

    res.render("start");
});

app.post("/auth/callback", async (req, res) => {
    const error = req.query["error"];

    if (error !== undefined) {
        return res.redirect("/auth/fail?error=" + error);
    }

    const accessToken = req.body["access_token"];

    if (typeof accessToken != "string") {
        return res.redirect("/auth/fail?error=unexpected");
    }

    req.session.accessToken = accessToken;
    req.session.authenticated = true;
    
    res.redirect("/auth/success");
});

app.get("/auth/fail", (req, res) => {
    const code = req.query["error"];

    if (!code) {
        return res.status(500).send("Failed to connect Spotify account");
    }

    if (code == "unexpected") {
        return res.status(400).send("Unexpected parameter encountered");
    }

    if (code == "access_denied") {
        return res.status(400).send("Access denied to Spotify account");
    }

    return res.status(500).send("Failed to connect Spotify account");
});

app.get("/auth/success", (req, res) => {
    res.redirect("/flow/playlists");
});

app.get("/flow/playlists", async (req, res) => {
    if (!req.session.authenticated) {
        return res.redirect("/error?code=unauthenticated");
    }

    const api = new SpotifyApi(req.session.accessToken);

    let reachedEnd = false;
    let offset = 0
    const playlists: SpotifyPlaylist[] = [];

    while (!reachedEnd) {
        const playlistsPaginated = await api.getPlaylists(50, offset);

        if (playlistsPaginated.items.length > 0) {
            playlists.push(...playlistsPaginated.items);

            offset += playlistsPaginated.items.length;
        } else {
            reachedEnd = true;
        }
    }

    res.render("playlists", {
        playlists
    });
});

app.post("/flow/tracks", async (req, res) => {
    if (!req.session.authenticated) {
        return res.redirect("/error?code=unauthenticated");
    }

    const playlistId = req.body["playlist"];

    if (!playlistId) {
        return res.redirect("/error?code=invalid_playlist")
    }

    const api = new SpotifyApi(req.session.accessToken);

    let reachedEnd = false;
    let offset = 0
    const songs: Partial<{ track: SpotifyTrack } & SpotifyAudioFeatures>[] = [];
    const missingSongs: string[] = [];

    while (!reachedEnd) {
        const songsPaginated = await api.getSongsFromPlaylist(playlistId, "items(track(artists(name),name,id,duration_ms)),next", 50, offset);
        const length = Number(songsPaginated.items.length);

        if (length > 0) {
            const songsSplit: SpotifyPlaylistTrack[][] = [];
            while (songsPaginated.items.length > 0) {
                songsSplit.push(songsPaginated.items.splice(0, 100));
            }

            for (let songsPart of songsSplit) {
                const songAudioFeaturesPart = await api.getSongAnalysis(songsPart.filter((song) => !!song.track.id).map((song) => song.track.id));

                const songsAndAudioFeaturesPart: Partial<SpotifyTrack & SpotifyAudioFeatures>[] = [];
                for (let songData of songsPart) {
                    const matchingAudioFeaturesData = songAudioFeaturesPart.audio_features.find((data) => data.id == songData.track.id);

                    if (matchingAudioFeaturesData === undefined) {
                        missingSongs.push(`${songData.track.artists.map((artist => artist.name)).join(", ")} - ${songData.track.name}`);
                        continue;
                    }

                    songsAndAudioFeaturesPart.push({
                        ...songData,
                        ...matchingAudioFeaturesData
                    });
                }

                songs.push(...songsAndAudioFeaturesPart);
            }

            offset += length;
        } else {
            reachedEnd = true;
        }
    }

    req.session.songs = songs;
    req.session.missingSongs = missingSongs;

    res.render("songs", {
        songs: songs.map((song) => {
            return {
                ...song,
                artists: song.track.artists.map((artist) => artist.name),
                key: (new SpotifyKey(song.key)).key,
                mode: (new SpotifyMode(song.mode)).mode
            }
        }),
        missingSongs
    });
});

app.get("/flow/tracks/organized", (req, res) => {
    /*
    AFlat Minor | B Major
    EFlat Minor | FSharp Major
    BFlat Minor | DFlat Major
    F Minor | AFlat Major
    C Minor | EFlat Major
    G Minor | BFlat Major
    D Minor | F Major
    A Minor | C Major
    E Minor | G Major
    B Minor | D Major
    FSharp Minor | A Major
    DFlat Minor | E Major
    */

    const songs: Partial<{ track: SpotifyTrack } & SpotifyAudioFeatures>[] = req.session.songs;

    const camelotSections: Partial<{ track: SpotifyTrack } & SpotifyAudioFeatures>[][] = [
        songs.filter((song) => song.key == SpotifyKey.AFlat && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.B && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.EFlat && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.FSharp && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.BFlat && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.DFlat && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.F && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.AFlat && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.C && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.EFlat && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.G && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.BFlat && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.D && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.F && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.A && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.C && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.E && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.G && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.B && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.D && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.FSharp && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.A && song.mode == SpotifyMode.Major),
        songs.filter((song) => song.key == SpotifyKey.DFlat && song.mode == SpotifyMode.Minor),
        songs.filter((song) => song.key == SpotifyKey.E && song.mode == SpotifyMode.Major)
    ];

    for (let i = 0; i < camelotSections.length; i++) {
        // TODO: Make algorithim that finds optimal tempo transitions
        camelotSections[i] = camelotSections[i].sort((a, b) => {
            return b.tempo - a.tempo;
        });
    }

    const sortedSongs: Partial<{ track: SpotifyTrack } & SpotifyAudioFeatures>[] = [];
    camelotSections.forEach((section) => {
        sortedSongs.push(...section);
    });

    res.render("songs-sorted", {
        songs: sortedSongs.map((song) => {
            return {
                ...song,
                artists: song.track.artists.map((artist) => artist.name),
                key: (new SpotifyKey(song.key)).key,
                mode: (new SpotifyMode(song.mode)).mode
            }
        }),
        missingSongs: req.session.missingSongs
    });
});

app.get("/api/create/playlist", async (req, res) => {

});

app.get("/error", (req, res) => {
    const code = req.query["code"];

    if (!code) {
        return res.status(500).send("An unexpected error occured");
    }

    if (code == "unauthenticated") {
        // return res.status(400).send("Session expired");

        return res.redirect("/auth");
    }

    if (code == "invalid_playlist") {
        return res.status(400).send("Empty or invalid playlist ID received");
    }

    return res.status(500).send("An unexpected error occured");
});

app.listen(3001, () => {
    console.log("Listening on port 3001!");
});