package com.squarepod.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.media.MediaPlayer;
import android.media.audiofx.Equalizer;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.text.TextUtils;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileFilter;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "LocalMusic",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_MEDIA_AUDIO }, alias = "audio"),
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class LocalMusicPlugin extends Plugin {
    private static final String PLAYBACK_PREFS = "squarepod_local_playback";
    private static final String PLAYBACK_STATE_KEY = "state";
    private static final String SOURCE_MODE_SQUAREPOD = "squarepod";
    private static final String SOURCE_MODE_ANDROID = "android";
    private static final String SOURCE_MODE_ALL = "all";
    private static final String SOURCE_APP_FOLDER = "appFolder";
    private static final String SOURCE_PUBLIC_SQUAREPOD = "publicSquarePod";
    private static final String SOURCE_MEDIA_STORE = "mediaStore";
    private static final long PERSIST_INTERVAL_MS = 5000;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final List<LocalTrack> queue = new ArrayList<>();
    private MediaPlayer player;
    private Equalizer equalizer;
    private int currentIndex = -1;
    private int savedPositionSeconds = 0;
    private long lastPersistAt = 0;
    private boolean prepared = false;
    private boolean shuffle = false;
    private String repeatMode = "off";
    private String eqPreset = "Off";
    private final Runnable progressTicker = new Runnable() {
        @Override
        public void run() {
            notifyState();
            persistPlaybackState(false);
            mainHandler.postDelayed(this, 1000);
        }
    };

    @Override
    public void load() {
        super.load();
        restoreSavedState();
    }

    @PluginMethod
    public void scanLibrary(PluginCall call) {
        if (!hasAudioPermission()) {
            requestPermissionForAlias(permissionAlias(), call, "scanLibraryPermissionCallback");
            return;
        }
        call.resolve(scanPayload(call.getString("sourceMode", SOURCE_MODE_SQUAREPOD)));
    }

    @PermissionCallback
    private void scanLibraryPermissionCallback(PluginCall call) {
        if (!hasAudioPermission()) {
            call.reject("Audio library permission denied.");
            return;
        }
        call.resolve(scanPayload(call.getString("sourceMode", SOURCE_MODE_SQUAREPOD)));
    }

    @PluginMethod
    public void playQueue(PluginCall call) {
        JSArray tracks = call.getArray("tracks");
        int startIndex = call.getInt("startIndex", 0);
        boolean nextShuffle = call.getBoolean("shuffle", false);
        String nextRepeat = call.getString("repeatMode", "off");

        if (tracks == null || tracks.length() == 0) {
            call.reject("Missing local music queue.");
            return;
        }

        List<LocalTrack> nextQueue = new ArrayList<>();
        for (int index = 0; index < tracks.length(); index += 1) {
            JSObject item = trackAt(tracks, index);
            LocalTrack track = LocalTrack.fromJS(item);
            if (track != null) nextQueue.add(track);
        }

        if (nextQueue.isEmpty()) {
            call.reject("No playable local tracks.");
            return;
        }

        queue.clear();
        queue.addAll(nextQueue);
        shuffle = nextShuffle;
        repeatMode = normalizeRepeat(nextRepeat);
        currentIndex = Math.max(0, Math.min(startIndex, queue.size() - 1));
        savedPositionSeconds = 0;
        persistPlaybackState(true);
        playCurrent(call);
    }

    @PluginMethod
    public void play(PluginCall call) {
        if (queue.isEmpty()) {
            restoreSavedState();
        }
        if (player == null || !prepared) {
            if (currentIndex >= 0 && currentIndex < queue.size()) {
                playCurrent(call, resumePositionSeconds());
                return;
            }
            call.reject("No local track is loaded.");
            return;
        }
        player.start();
        startTicker();
        persistPlaybackState(true);
        resolveWithState(call);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        if (player != null && prepared && player.isPlaying()) {
            player.pause();
        }
        persistPlaybackState(true);
        resolveWithState(call);
    }

    @PluginMethod
    public void next(PluginCall call) {
        if (queue.isEmpty()) {
            call.reject("No local music queue.");
            return;
        }
        currentIndex = nextIndex();
        savedPositionSeconds = 0;
        persistPlaybackState(true);
        playCurrent(call);
    }

    @PluginMethod
    public void previous(PluginCall call) {
        if (queue.isEmpty()) {
            call.reject("No local music queue.");
            return;
        }
        currentIndex = Math.max(0, currentIndex - 1);
        savedPositionSeconds = 0;
        persistPlaybackState(true);
        playCurrent(call);
    }

    @PluginMethod
    public void seek(PluginCall call) {
        int position = call.getInt("position", 0);
        savedPositionSeconds = Math.max(0, position);
        if (player != null && prepared) {
            player.seekTo(savedPositionSeconds * 1000);
        }
        persistPlaybackState(true);
        resolveWithState(call);
    }

    @PluginMethod
    public void setShuffle(PluginCall call) {
        shuffle = call.getBoolean("enabled", false);
        persistPlaybackState(true);
        resolveWithState(call);
    }

    @PluginMethod
    public void setRepeat(PluginCall call) {
        repeatMode = normalizeRepeat(call.getString("mode", "off"));
        persistPlaybackState(true);
        resolveWithState(call);
    }

    @PluginMethod
    public void setEq(PluginCall call) {
        eqPreset = normalizeEqPreset(call.getString("preset", "Off"));
        applyEqualizer();
        resolveWithState(call);
    }

    @PluginMethod
    public void getState(PluginCall call) {
        if (queue.isEmpty()) {
            restoreSavedState();
        }
        resolveWithState(call);
    }

    @Override
    protected void handleOnDestroy() {
        persistPlaybackState(true);
        stopTicker();
        releasePlayer();
        super.handleOnDestroy();
    }

    private JSObject scanPayload(String sourceMode) {
        String normalizedSourceMode = normalizeSourceMode(sourceMode);
        List<LocalTrack> tracks = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Set<String> seenPaths = new HashSet<>();
        int appFolderCount = 0;
        int publicSquarePodCount = 0;
        int mediaStoreCount = 0;

        if (SOURCE_MODE_SQUAREPOD.equals(normalizedSourceMode) || SOURCE_MODE_ALL.equals(normalizedSourceMode)) {
            List<LocalTrack> appFolderTracks = scanAppMusicDirectory(seen, seenPaths);
            appFolderCount = appFolderTracks.size();
            tracks.addAll(appFolderTracks);

            List<LocalTrack> publicSquarePodTracks = scanPublicSquarePodDirectory(seen, seenPaths);
            publicSquarePodCount = publicSquarePodTracks.size();
            tracks.addAll(publicSquarePodTracks);
        }

        if (SOURCE_MODE_ANDROID.equals(normalizedSourceMode) || SOURCE_MODE_ALL.equals(normalizedSourceMode)) {
            List<LocalTrack> mediaStoreTracks = scanMediaStore(seen, seenPaths);
            mediaStoreCount = mediaStoreTracks.size();
            tracks.addAll(mediaStoreTracks);
        }

        Collections.sort(tracks, Comparator
            .comparing((LocalTrack track) -> safe(track.artist).toLowerCase(Locale.ROOT))
            .thenComparing(track -> safe(track.album).toLowerCase(Locale.ROOT))
            .thenComparingInt(track -> track.trackNumber)
            .thenComparing(track -> safe(track.title).toLowerCase(Locale.ROOT)));

        JSArray trackArray = new JSArray();
        for (LocalTrack track : tracks) {
            trackArray.put(track.toJS());
        }

        JSObject payload = new JSObject();
        payload.put("tracks", trackArray);
        payload.put("musicDirectory", appMusicDirectory().getAbsolutePath());
        payload.put("publicMusicDirectory", publicSquarePodDirectory().getAbsolutePath());
        payload.put("sourceMode", normalizedSourceMode);
        JSObject sourceCounts = new JSObject();
        sourceCounts.put(SOURCE_APP_FOLDER, appFolderCount);
        sourceCounts.put(SOURCE_PUBLIC_SQUAREPOD, publicSquarePodCount);
        sourceCounts.put(SOURCE_MEDIA_STORE, mediaStoreCount);
        payload.put("sourceCounts", sourceCounts);
        return payload;
    }

    private List<LocalTrack> scanMediaStore(Set<String> seen, Set<String> seenPaths) {
        List<LocalTrack> tracks = new ArrayList<>();
        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.ALBUM_ID,
        };
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";

        try (Cursor cursor = getContext().getContentResolver().query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            null,
            MediaStore.Audio.Media.TITLE + " ASC"
        )) {
            if (cursor == null) return tracks;
            int idIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
            int dataIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
            int titleIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
            int artistIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
            int albumIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
            int durationIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
            int trackIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK);
            int albumIdIndex = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);

            while (cursor.moveToNext()) {
                long id = cursor.getLong(idIndex);
                Uri uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
                String uriString = uri.toString();
                if (!seen.add(uriString)) continue;
                String path = cursor.getString(dataIndex);
                if (!TextUtils.isEmpty(path)) seenPaths.add(path);
                long albumId = cursor.getLong(albumIdIndex);
                String trackId = "mediastore_" + id;
                String albumIdKey = albumId > 0 ? "mediastore_album_" + albumId : null;
                String albumArtist = readAlbumArtist(path);
                String artworkUri = null;
                if (!TextUtils.isEmpty(path)) {
                    artworkUri = extractEmbeddedArtwork(path, trackId);
                }
                if (artworkUri == null) {
                    artworkUri = cacheAlbumArtwork(albumId, trackId);
                }
                tracks.add(new LocalTrack(
                    trackId,
                    uriString,
                    safeTitle(cursor.getString(titleIndex), uriString),
                    safeArtist(cursor.getString(artistIndex)),
                    safeAlbum(cursor.getString(albumIndex)),
                    albumArtist,
                    albumIdKey,
                    readGenre(path),
                    Math.max(1, Math.round(cursor.getLong(durationIndex) / 1000f)),
                    Math.max(0, cursor.getInt(trackIndex) % 1000),
                    artworkUri,
                    readSidecarLyrics(path),
                    SOURCE_MEDIA_STORE,
                    path
                ));
            }
        } catch (Throwable ignored) {
            return tracks;
        }
        return tracks;
    }

    private List<LocalTrack> scanAppMusicDirectory(Set<String> seen, Set<String> seenPaths) {
        List<LocalTrack> tracks = new ArrayList<>();
        File directory = appMusicDirectory();
        if (!directory.exists()) directory.mkdirs();
        scanFilesRecursive(directory, seen, seenPaths, tracks, SOURCE_APP_FOLDER);
        return tracks;
    }

    private List<LocalTrack> scanPublicSquarePodDirectory(Set<String> seen, Set<String> seenPaths) {
        List<LocalTrack> tracks = new ArrayList<>();
        File directory = publicSquarePodDirectory();
        if (!directory.exists()) return tracks;
        scanFilesRecursive(directory, seen, seenPaths, tracks, SOURCE_PUBLIC_SQUAREPOD);
        return tracks;
    }

    private void scanFilesRecursive(File directory, Set<String> seen, Set<String> seenPaths, List<LocalTrack> tracks, String source) {
        File[] files = directory.listFiles(new FileFilter() {
            @Override
            public boolean accept(File file) {
                return file.isDirectory() || isAudioFile(file.getName());
            }
        });
        if (files == null) return;

        for (File file : files) {
            if (file.isDirectory()) {
                scanFilesRecursive(file, seen, seenPaths, tracks, source);
                continue;
            }
            String path = file.getAbsolutePath();
            if (!seenPaths.add(path)) continue;
            Uri uri = Uri.fromFile(file);
            String uriString = uri.toString();
            if (!seen.add(uriString)) continue;
            tracks.add(trackFromFile(file, uriString, source));
        }
    }

    private LocalTrack trackFromFile(File file, String uriString, String source) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(file.getAbsolutePath());
            String title = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
            String artist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
            String album = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
            String albumArtist = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST);
            String genre = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_GENRE);
            String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            String trackNumber = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER);
            String trackId = "file_" + Math.abs(uriString.hashCode());
            return new LocalTrack(
                trackId,
                uriString,
                safeTitle(title, file.getName()),
                safeArtist(artist),
                safeAlbum(album),
                safeOptionalMetadata(albumArtist),
                null,
                safeGenre(genre),
                parseDuration(duration),
                parseTrackNumber(trackNumber),
                writeArtwork(retriever.getEmbeddedPicture(), trackId),
                readSidecarLyrics(file),
                source,
                file.getAbsolutePath()
            );
        } catch (Throwable ignored) {
            return new LocalTrack(
                "file_" + Math.abs(uriString.hashCode()),
                uriString,
                safeTitle(null, file.getName()),
                "Unknown Artist",
                "Unknown Album",
                null,
                null,
                "Unknown Genre",
                1,
                0,
                null,
                readSidecarLyrics(file),
                source,
                file.getAbsolutePath()
            );
        } finally {
            try {
                retriever.release();
            } catch (IOException ignored) {}
        }
    }

    private String readGenre(String path) {
        if (TextUtils.isEmpty(path)) return "Unknown Genre";
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(path);
            return safeGenre(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_GENRE));
        } catch (Throwable ignored) {
            return "Unknown Genre";
        } finally {
            try {
                retriever.release();
            } catch (IOException ignored) {}
        }
    }

    private String readAlbumArtist(String path) {
        if (TextUtils.isEmpty(path)) return null;
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(path);
            return safeOptionalMetadata(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST));
        } catch (Throwable ignored) {
            return null;
        } finally {
            try {
                retriever.release();
            } catch (IOException ignored) {}
        }
    }

    private void playCurrent(PluginCall call) {
        playCurrent(call, 0);
    }

    private void playCurrent(PluginCall call, int startPositionSeconds) {
        if (currentIndex < 0 || currentIndex >= queue.size()) {
            if (call != null) call.reject("No local track selected.");
            return;
        }
        LocalTrack track = queue.get(currentIndex);
        try {
            releasePlayer();
            prepared = false;
            player = new MediaPlayer();
            player.setDataSource(getContext(), Uri.parse(track.uri));
            player.setOnPreparedListener(mediaPlayer -> {
                prepared = true;
                int boundedPosition = boundedResumePosition(track, startPositionSeconds);
                if (boundedPosition > 0) {
                    mediaPlayer.seekTo(boundedPosition * 1000);
                }
                savedPositionSeconds = boundedPosition;
                applyEqualizer();
                mediaPlayer.start();
                startTicker();
                persistPlaybackState(true);
                resolveWithState(call);
            });
            player.setOnCompletionListener(mediaPlayer -> {
                if ("one".equals(repeatMode)) {
                    mediaPlayer.seekTo(0);
                    mediaPlayer.start();
                    savedPositionSeconds = 0;
                    persistPlaybackState(true);
                    notifyState();
                    return;
                }
                if (currentIndex < queue.size() - 1 || "all".equals(repeatMode) || shuffle) {
                    currentIndex = nextIndex();
                    savedPositionSeconds = 0;
                    persistPlaybackState(true);
                    playCurrent(null);
                } else {
                    savedPositionSeconds = 0;
                    persistPlaybackState(true);
                    notifyState();
                }
            });
            player.setOnErrorListener((mediaPlayer, what, extra) -> {
                JSObject payload = new JSObject();
                payload.put("message", "Local playback failed: " + what + "/" + extra);
                notifyListeners("playbackError", payload);
                return true;
            });
            player.prepareAsync();
        } catch (Throwable error) {
            if (call != null) {
                call.reject("Unable to play local track: " + rootMessage(error));
            } else {
                JSObject payload = new JSObject();
                payload.put("message", "Unable to play local track: " + rootMessage(error));
                notifyListeners("playbackError", payload);
            }
        }
    }

    private int nextIndex() {
        if (queue.isEmpty()) return -1;
        if (shuffle && queue.size() > 1) {
            int next = (int) Math.floor(Math.random() * queue.size());
            return next == currentIndex ? (next + 1) % queue.size() : next;
        }
        if (currentIndex < queue.size() - 1) return currentIndex + 1;
        return "all".equals(repeatMode) ? 0 : currentIndex;
    }

    private void resolveWithState(PluginCall call) {
        if (call != null) call.resolve(statePayload());
        notifyState();
    }

    private void notifyState() {
        notifyListeners("playbackState", statePayload());
    }

    private int currentPositionSeconds() {
        if (player != null && prepared) {
            try {
                return Math.max(0, player.getCurrentPosition() / 1000);
            } catch (Throwable ignored) {
                return savedPositionSeconds;
            }
        }
        return savedPositionSeconds;
    }

    private int currentDurationSeconds() {
        if (player != null && prepared) {
            try {
                return Math.max(1, player.getDuration() / 1000);
            } catch (Throwable ignored) {
                return currentTrackDurationSeconds();
            }
        }
        return currentTrackDurationSeconds();
    }

    private int currentTrackDurationSeconds() {
        if (currentIndex >= 0 && currentIndex < queue.size()) {
            return Math.max(1, queue.get(currentIndex).duration);
        }
        return 0;
    }

    private int resumePositionSeconds() {
        if (player != null && prepared) return currentPositionSeconds();
        if (currentIndex >= 0 && currentIndex < queue.size()) {
            return boundedResumePosition(queue.get(currentIndex), savedPositionSeconds);
        }
        return 0;
    }

    private int boundedResumePosition(LocalTrack track, int positionSeconds) {
        int duration = Math.max(1, track.duration);
        int position = Math.max(0, positionSeconds);
        if (position >= duration - 3) return 0;
        return Math.min(position, duration - 1);
    }

    private JSObject statePayload() {
        JSObject payload = new JSObject();
        boolean isPlaying = player != null && prepared && player.isPlaying();
        savedPositionSeconds = currentPositionSeconds();
        payload.put("isPlaying", isPlaying);
        payload.put("state", isPlaying ? "playing" : currentIndex >= 0 && currentIndex < queue.size() ? "paused" : "stopped");
        payload.put("position", savedPositionSeconds);
        payload.put("duration", currentDurationSeconds());
        payload.put("shuffle", shuffle);
        payload.put("repeatMode", repeatMode);
        payload.put("index", currentIndex);
        payload.put("queueLength", queue.size());
        JSArray queueArray = new JSArray();
        for (LocalTrack track : queue) {
            queueArray.put(track.toJS());
        }
        payload.put("queue", queueArray);
        if (currentIndex >= 0 && currentIndex < queue.size()) {
            payload.put("track", queue.get(currentIndex).toJS());
        }
        return payload;
    }

    private void persistPlaybackState(boolean force) {
        if (queue.isEmpty() || currentIndex < 0 || currentIndex >= queue.size()) return;

        long now = System.currentTimeMillis();
        if (!force && now - lastPersistAt < PERSIST_INTERVAL_MS) return;
        lastPersistAt = now;

        try {
            int position = currentPositionSeconds();
            if (currentIndex >= 0 && currentIndex < queue.size()) {
                position = boundedResumePosition(queue.get(currentIndex), position);
            }
            savedPositionSeconds = position;

            JSONArray queueJson = new JSONArray();
            for (LocalTrack track : queue) {
                queueJson.put(track.toJS());
            }

            JSONObject state = new JSONObject();
            state.put("queue", queueJson);
            state.put("index", currentIndex);
            state.put("position", savedPositionSeconds);
            state.put("shuffle", shuffle);
            state.put("repeatMode", repeatMode);
            state.put("wasPlaying", player != null && prepared && player.isPlaying());
            state.put("trackId", queue.get(currentIndex).id);
            state.put("updatedAt", now);

            playbackPrefs().edit().putString(PLAYBACK_STATE_KEY, state.toString()).apply();
        } catch (Throwable ignored) {}
    }

    private void restoreSavedState() {
        if (!queue.isEmpty()) return;

        String rawState = playbackPrefs().getString(PLAYBACK_STATE_KEY, null);
        if (TextUtils.isEmpty(rawState)) return;

        try {
            JSONObject state = new JSONObject(rawState);
            JSONArray queueJson = state.optJSONArray("queue");
            if (queueJson == null || queueJson.length() == 0) return;

            List<LocalTrack> restoredQueue = new ArrayList<>();
            String trackId = state.optString("trackId", "");
            int restoredIndex = -1;

            for (int index = 0; index < queueJson.length(); index += 1) {
                JSONObject item = queueJson.optJSONObject(index);
                LocalTrack track = LocalTrack.fromJS(item == null ? null : JSObject.fromJSONObject(item));
                if (track == null || !isRestorableTrack(track)) continue;
                if (!TextUtils.isEmpty(trackId) && trackId.equals(track.id)) {
                    restoredIndex = restoredQueue.size();
                }
                restoredQueue.add(track);
            }

            if (restoredQueue.isEmpty()) {
                playbackPrefs().edit().remove(PLAYBACK_STATE_KEY).apply();
                return;
            }

            queue.clear();
            queue.addAll(restoredQueue);
            currentIndex = restoredIndex >= 0
                ? restoredIndex
                : Math.max(0, Math.min(state.optInt("index", 0), queue.size() - 1));
            shuffle = state.optBoolean("shuffle", false);
            repeatMode = normalizeRepeat(state.optString("repeatMode", "off"));
            savedPositionSeconds = boundedResumePosition(queue.get(currentIndex), state.optInt("position", 0));
        } catch (Throwable ignored) {}
    }

    private boolean isRestorableTrack(LocalTrack track) {
        Uri uri = Uri.parse(track.uri);
        if (!"file".equals(uri.getScheme())) return true;
        String path = uri.getPath();
        return !TextUtils.isEmpty(path) && new File(path).exists();
    }

    private SharedPreferences playbackPrefs() {
        return getContext().getSharedPreferences(PLAYBACK_PREFS, Context.MODE_PRIVATE);
    }

    private void releasePlayer() {
        releaseEqualizer();
        if (player != null) {
            player.reset();
            player.release();
            player = null;
        }
        prepared = false;
    }

    private void applyEqualizer() {
        releaseEqualizer();
        if (player == null || "Off".equals(eqPreset)) return;

        try {
            equalizer = new Equalizer(0, player.getAudioSessionId());
            short[] range = equalizer.getBandLevelRange();
            short minLevel = range[0];
            short maxLevel = range[1];
            short bandCount = equalizer.getNumberOfBands();

            for (short band = 0; band < bandCount; band += 1) {
                int[] freqRange = equalizer.getBandFreqRange(band);
                int centerHz = ((freqRange[0] + freqRange[1]) / 2) / 1000;
                int level = eqLevelForBand(centerHz, minLevel, maxLevel);
                equalizer.setBandLevel(band, clampLevel(level, minLevel, maxLevel));
            }

            equalizer.setEnabled(true);
        } catch (Throwable ignored) {
            releaseEqualizer();
        }
    }

    private int eqLevelForBand(int centerHz, short minLevel, short maxLevel) {
        int boost = Math.min(700, Math.max(150, maxLevel / 3));
        int cut = Math.max(-500, Math.min(-100, minLevel / 4));

        if ("Bass Boost".equals(eqPreset)) {
            if (centerHz <= 250) return boost;
            if (centerHz >= 4000) return cut;
            return 0;
        }
        if ("Treble Boost".equals(eqPreset)) {
            if (centerHz >= 4000) return boost;
            if (centerHz <= 180) return cut;
            return 0;
        }
        if ("Spoken Word".equals(eqPreset)) {
            if (centerHz >= 500 && centerHz <= 3500) return boost;
            if (centerHz <= 160 || centerHz >= 8000) return cut;
            return 0;
        }
        return 0;
    }

    private short clampLevel(int level, short minLevel, short maxLevel) {
        return (short) Math.max(minLevel, Math.min(maxLevel, level));
    }

    private void releaseEqualizer() {
        if (equalizer != null) {
            try {
                equalizer.setEnabled(false);
                equalizer.release();
            } catch (Throwable ignored) {}
            equalizer = null;
        }
    }

    private String normalizeEqPreset(String preset) {
        if ("Bass Boost".equals(preset)) return "Bass Boost";
        if ("Treble Boost".equals(preset)) return "Treble Boost";
        if ("Spoken Word".equals(preset)) return "Spoken Word";
        return "Off";
    }

    private void startTicker() {
        mainHandler.removeCallbacks(progressTicker);
        mainHandler.postDelayed(progressTicker, 1000);
    }

    private void stopTicker() {
        mainHandler.removeCallbacks(progressTicker);
    }

    private boolean hasAudioPermission() {
        return getPermissionState(permissionAlias()) == PermissionState.GRANTED
            || Build.VERSION.SDK_INT < Build.VERSION_CODES.M;
    }

    private String permissionAlias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio" : "storage";
    }

    private File appMusicDirectory() {
        File base = getContext().getExternalFilesDir(null);
        if (base == null) base = getContext().getFilesDir();
        return new File(base, "Music");
    }

    private File publicSquarePodDirectory() {
        File musicRoot = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC);
        return new File(musicRoot, "SquarePod");
    }

    private String normalizeSourceMode(String value) {
        if (SOURCE_MODE_ANDROID.equals(value)) return SOURCE_MODE_ANDROID;
        if (SOURCE_MODE_ALL.equals(value)) return SOURCE_MODE_ALL;
        return SOURCE_MODE_SQUAREPOD;
    }

    private String extractEmbeddedArtwork(String path, String trackId) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(path);
            return writeArtwork(retriever.getEmbeddedPicture(), trackId);
        } catch (Throwable ignored) {
            return null;
        } finally {
            try {
                retriever.release();
            } catch (IOException ignored) {}
        }
    }

    private String cacheAlbumArtwork(long albumId, String trackId) {
        if (albumId <= 0) return null;
        Uri uri = ContentUris.withAppendedId(
            Uri.parse("content://media/external/audio/albumart"),
            albumId
        );
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            byte[] bytes = readAllBytes(input);
            return writeArtwork(bytes, trackId);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private String writeArtwork(byte[] bytes, String trackId) {
        if (bytes == null || bytes.length == 0) return null;
        File directory = new File(getContext().getCacheDir(), "artwork");
        if (!directory.exists() && !directory.mkdirs()) return null;
        String extension = artworkExtension(bytes);
        File file = new File(directory, safeFileName(trackId) + extension);
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
            return Uri.fromFile(file).toString();
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static byte[] readAllBytes(InputStream input) throws IOException {
        byte[] buffer = new byte[8192];
        int read;
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static String artworkExtension(byte[] bytes) {
        if (bytes.length >= 8
            && (bytes[0] & 0xff) == 0x89
            && bytes[1] == 0x50
            && bytes[2] == 0x4e
            && bytes[3] == 0x47) {
            return ".png";
        }
        if (bytes.length >= 3
            && (bytes[0] & 0xff) == 0xff
            && (bytes[1] & 0xff) == 0xd8
            && (bytes[2] & 0xff) == 0xff) {
            return ".jpg";
        }
        return ".jpg";
    }

    private static String safeFileName(String value) {
        return value.replaceAll("[^a-zA-Z0-9_.-]", "_");
    }

    private static boolean isAudioFile(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".mp3")
            || lower.endsWith(".m4a")
            || lower.endsWith(".aac")
            || lower.endsWith(".flac")
            || lower.endsWith(".wav")
            || lower.endsWith(".ogg")
            || lower.endsWith(".opus");
    }

    private static List<LyricLine> readSidecarLyrics(String audioPath) {
        if (TextUtils.isEmpty(audioPath)) return Collections.emptyList();
        return readSidecarLyrics(new File(audioPath));
    }

    private static List<LyricLine> readSidecarLyrics(File audioFile) {
        if (audioFile == null) return Collections.emptyList();
        File parent = audioFile.getParentFile();
        String name = audioFile.getName();
        int extensionIndex = name.lastIndexOf('.');
        if (parent == null || extensionIndex <= 0) return Collections.emptyList();

        File lyricFile = new File(parent, name.substring(0, extensionIndex) + ".lrc");
        if (!lyricFile.exists() || !lyricFile.isFile()) return Collections.emptyList();

        List<LyricLine> lines = new ArrayList<>();
        List<String> rawLines = new ArrayList<>();
        int offsetMs = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(lyricFile), StandardCharsets.UTF_8))) {
            String rawLine;
            while ((rawLine = reader.readLine()) != null) {
                String line = rawLine.replace("\uFEFF", "").trim();
                if (line.isEmpty()) continue;
                rawLines.add(line);

                String lower = line.toLowerCase(Locale.ROOT);
                if (lower.startsWith("[offset:") && line.endsWith("]")) {
                    try {
                        offsetMs = Integer.parseInt(line.substring(8, line.length() - 1).trim());
                    } catch (Throwable ignored) {}
                }
            }

            for (String line : rawLines) {
                String lower = line.toLowerCase(Locale.ROOT);
                if (lower.startsWith("[offset:") && line.endsWith("]")) continue;

                List<Integer> timestamps = new ArrayList<>();
                int cursor = 0;
                while (cursor < line.length() && line.charAt(cursor) == '[') {
                    int end = line.indexOf(']', cursor);
                    if (end <= cursor) break;
                    int time = parseLrcTimeMs(line.substring(cursor + 1, end));
                    if (time >= 0) timestamps.add(time);
                    cursor = end + 1;
                }

                if (timestamps.isEmpty()) continue;
                String text = line.substring(cursor).trim();
                if (text.isEmpty()) continue;
                for (int timestamp : timestamps) {
                    int seconds = Math.max(0, Math.round((timestamp + offsetMs) / 1000f));
                    lines.add(new LyricLine(seconds, text));
                }
            }
        } catch (Throwable ignored) {
            return Collections.emptyList();
        }

        Collections.sort(lines, Comparator.comparingInt(line -> line.time));
        return lines;
    }

    private static int parseLrcTimeMs(String value) {
        int separator = value.indexOf(':');
        if (separator <= 0) return -1;
        try {
            int minutes = Integer.parseInt(value.substring(0, separator));
            String secondsValue = value.substring(separator + 1);
            int seconds;
            int milliseconds = 0;
            int dot = secondsValue.indexOf('.');
            if (dot >= 0) {
                seconds = Integer.parseInt(secondsValue.substring(0, dot));
                String fraction = secondsValue.substring(dot + 1);
                if (fraction.length() == 1) {
                    milliseconds = Integer.parseInt(fraction) * 100;
                } else if (fraction.length() == 2) {
                    milliseconds = Integer.parseInt(fraction) * 10;
                } else if (fraction.length() >= 3) {
                    milliseconds = Integer.parseInt(fraction.substring(0, 3));
                }
            } else {
                seconds = Integer.parseInt(secondsValue);
            }
            return (minutes * 60 + seconds) * 1000 + milliseconds;
        } catch (Throwable ignored) {
            return -1;
        }
    }

    private static String normalizeRepeat(String value) {
        if ("one".equals(value) || "all".equals(value)) return value;
        return "off";
    }

    private static int parseDuration(String value) {
        try {
            return Math.max(1, Math.round(Long.parseLong(value) / 1000f));
        } catch (Throwable ignored) {
            return 1;
        }
    }

    private static int parseTrackNumber(String value) {
        if (TextUtils.isEmpty(value)) return 0;
        try {
            return Math.max(0, Integer.parseInt(value.replaceAll("[^0-9]", "")) % 1000);
        } catch (Throwable ignored) {
            return 0;
        }
    }

    private static String safe(String value) {
        return TextUtils.isEmpty(value) ? "" : value;
    }

    private static String safeTitle(String value, String fallback) {
        return TextUtils.isEmpty(value) ? fallback.replaceFirst("\\.[^.]+$", "") : value;
    }

    private static String safeArtist(String value) {
        return TextUtils.isEmpty(value) || "<unknown>".equals(value) ? "Unknown Artist" : value;
    }

    private static String safeAlbum(String value) {
        return TextUtils.isEmpty(value) || "<unknown>".equals(value) ? "Unknown Album" : value;
    }

    private static String safeGenre(String value) {
        return TextUtils.isEmpty(value) || "<unknown>".equals(value) ? "Unknown Genre" : value;
    }

    private static String safeOptionalMetadata(String value) {
        String trimmed = value == null ? "" : value.trim();
        return TextUtils.isEmpty(trimmed) || "<unknown>".equals(trimmed) ? null : trimmed;
    }

    private static String rootMessage(Throwable error) {
        Throwable root = error;
        while (root != null && root.getCause() != null) {
            root = root.getCause();
        }
        if (root == null) return "Unknown error";
        return root.getMessage() != null ? root.getMessage() : root.getClass().getSimpleName();
    }

    private static JSObject trackAt(JSArray array, int index) {
        try {
            Object value = array.get(index);
            if (value instanceof JSObject) return (JSObject) value;
            if (value instanceof JSONObject) return JSObject.fromJSONObject((JSONObject) value);
        } catch (Throwable ignored) {}
        return null;
    }

    private static class LocalTrack {
        final String id;
        final String uri;
        final String title;
        final String artist;
        final String album;
        final String albumArtist;
        final String albumId;
        final String genre;
        final int duration;
        final int trackNumber;
        final String artworkUri;
        final List<LyricLine> lyrics;
        final String source;
        final String sourcePath;

        LocalTrack(String id, String uri, String title, String artist, String album, String albumArtist, String albumId, String genre, int duration, int trackNumber, String artworkUri, List<LyricLine> lyrics, String source, String sourcePath) {
            this.id = id;
            this.uri = uri;
            this.title = title;
            this.artist = artist;
            this.album = album;
            this.albumArtist = albumArtist;
            this.albumId = albumId;
            this.genre = genre;
            this.duration = duration;
            this.trackNumber = trackNumber;
            this.artworkUri = artworkUri;
            this.lyrics = lyrics == null ? Collections.emptyList() : lyrics;
            this.source = source;
            this.sourcePath = sourcePath;
        }

        JSObject toJS() {
            JSObject object = new JSObject();
            object.put("id", id);
            object.put("uri", uri);
            object.put("title", title);
            object.put("artist", artist);
            object.put("album", album);
            if (albumArtist != null) object.put("albumArtist", albumArtist);
            if (albumId != null) object.put("albumId", albumId);
            object.put("genre", genre);
            object.put("duration", duration);
            object.put("trackNumber", trackNumber);
            if (artworkUri != null) object.put("artworkUri", artworkUri);
            if (source != null) object.put("source", source);
            if (sourcePath != null) object.put("sourcePath", sourcePath);
            if (!lyrics.isEmpty()) {
                JSArray lyricArray = new JSArray();
                for (LyricLine line : lyrics) {
                    lyricArray.put(line.toJS());
                }
                object.put("lyrics", lyricArray);
            }
            return object;
        }

        static LocalTrack fromJS(JSObject object) {
            if (object == null) return null;
            String uri = object.getString("uri");
            if (TextUtils.isEmpty(uri)) return null;
            return new LocalTrack(
                object.getString("id", "track_" + Math.abs(uri.hashCode())),
                uri,
                object.getString("title", "Unknown Track"),
                object.getString("artist", "Unknown Artist"),
                object.getString("album", "Unknown Album"),
                object.getString("albumArtist"),
                object.getString("albumId"),
                object.getString("genre", "Unknown Genre"),
                object.getInteger("duration", 1),
                object.getInteger("trackNumber", 0),
                object.getString("artworkUri"),
                lyricsFromJS(object),
                object.getString("source"),
                object.getString("sourcePath")
            );
        }

        private static List<LyricLine> lyricsFromJS(JSObject object) {
            JSONArray array = object.optJSONArray("lyrics");
            if (array == null || array.length() == 0) return Collections.emptyList();
            List<LyricLine> lines = new ArrayList<>();
            for (int index = 0; index < array.length(); index += 1) {
                JSONObject item = array.optJSONObject(index);
                if (item == null) continue;
                int time = Math.max(0, item.optInt("time", -1));
                String text = item.optString("text", "").trim();
                if (time >= 0 && !TextUtils.isEmpty(text)) {
                    lines.add(new LyricLine(time, text));
                }
            }
            Collections.sort(lines, Comparator.comparingInt(line -> line.time));
            return lines;
        }
    }

    private static class LyricLine {
        final int time;
        final String text;

        LyricLine(int time, String text) {
            this.time = time;
            this.text = text;
        }

        JSObject toJS() {
            JSObject object = new JSObject();
            object.put("time", time);
            object.put("text", text);
            return object;
        }
    }
}
