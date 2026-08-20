# Native library dependencies

## Spotify

`spotify-app-remote-release-0.8.0.aar` is checked in for Spotify remote control.

## Apple MusicKit Android SDK

Place the official Apple MusicKit Android SDK AAR files in this directory for real Apple Music sign-in and playback.

`apple-musickit-stubs.jar` is a compile-only stub so debug builds work without Apple's proprietary AARs. Real Apple Music playback still requires the official SDK AARs (and native libs) at runtime; replace/remove the stubs when adding those AARs.
