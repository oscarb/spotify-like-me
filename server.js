'use strict';

const express = require('express');
const storage = require('node-persist');
const config = require('./config')
const SpotifyWebApi = require('spotify-web-api-node');

const PORT = 8080;
const HOST = '0.0.0.0';

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUrl = `${process.env.HOST}:${process.env.PORT}/callback`

const scopes = ['user-read-currently-playing', 'user-library-modify', 'playlist-modify-private']

// App
const app = express();

// Spotify API 
const spotifyApi = new SpotifyWebApi({
  clientId: clientId,
  clientSecret: clientSecret,
  redirectUri: redirectUrl
});

// Setup storage
initStorage();

async function initStorage() {
  await storage.init();
  let accessToken = await storage.get('accessToken')
  let refreshToken = await storage.get('refreshToken')

  spotifyApi.setAccessToken(accessToken);
  spotifyApi.setRefreshToken(refreshToken);
}

async function likePlayingTrack(retryCount = 0) {
  console.log('/like requested...')

  try {
    // Get currently playing track 
        let playingTrackData = await spotifyApi.getMyCurrentPlayingTrack();
    let trackId = playingTrackData.body.item.id;
    let title = playingTrackData.body.item.name
    let albumId = playingTrackData.body.item.album.id
    let artist = playingTrackData.body.item.artists
      .map((artist) => artist.name)
      .reduce((prev, next) => `${prev}, ${next}`);

    // Like it!
    await spotifyApi.addToMySavedTracks([trackId]);
    console.log(`Added ${artist} - ${title} (${trackId}) to library`);

    // Add albun tracks to seasonal playlist, i.e. "Fall 2021", "Winter 2021" etc.
    let albumData = await spotifyApi.getAlbumTracks(albumId);
    let trackUris = albumData.body.items.map(item => item.uri)

    let seasonPlaylistName = getSeasonName();

    // Check if playlist id exists in cache
    let cacheKey = seasonPlaylistName.toLowerCase().replace(' ', '');
    let seasonPlaylistId = await storage.getItem(cacheKey);
    console.log(`Looked in cache for ${seasonPlaylistName} with key ${cacheKey}, got ${seasonPlaylistId}`);

    if (seasonPlaylistId === undefined) {
      // No id in cache, see if playlist with the same name by authorized user can be found.
      let userData = await spotifyApi.getMe();
      let userId = userData.body.id;

      let playlistData = await spotifyApi.searchPlaylists(seasonPlaylistName);
      seasonPlaylistId = playlistData.body.playlists.items
        .find(({ owner, name }) => owner.id == userId && name == seasonPlaylistName)?.id;

      if (seasonPlaylistId === undefined) {
        // No playlist found, create one
        let createdPlaylistData = await spotifyApi.createPlaylist(seasonPlaylistName, { public: false, collaborative: false })
        seasonPlaylistId = createdPlaylistData.body.id;
        console.log(`No season playlist found, created ${seasonPlaylistName}, id: ${seasonPlaylistId}`)
      }

      // Add season playlist id to cache with ttl of 3 months 
      await storage.setItem(cacheKey, seasonPlaylistId, { ttl: 1000 * 60 * 60 * 24 * 90 })
    }

    // Add tracks to season playlist skipping duplicates
    await spotifyApi.removeTracksFromPlaylist(seasonPlaylistId, trackUris.map(trackUri => ({ uri: trackUri })))
    await spotifyApi.addTracksToPlaylist(seasonPlaylistId, trackUris)

    // Add to otjer playlists
    for (const playlist of config.playlists) {
      await spotifyApi.removeTracksFromPlaylist(playlist, trackUris.map(trackUri => ({ uri: trackUri })))
      await spotifyApi.addTracksToPlaylist(playlist, trackUris)
    }

  } catch (err) {
    console.log(err);

    if (err.statusCode == 401 && retryCount < 5) {
      // Access token likely expired, refresh token
      let data = await spotifyApi.refreshAccessToken();
      console.log("Refreshed token. mew token: " + JSON.stringify(data));
      spotifyApi.setAccessToken(data.body['access_token']);
      await storage.set('accessToken', data.body['access_token']);

      return await likePlayingTrack(++retryCount);
    } else {
      return err;
    }
  }
}

function getSeasonName() {
  // Dec, Jan, Feb -> Winter 2021
  // Mar, Apr, May -> Spring 2022
  // Jun, Jul, Aug -> Summer 2022
  // Sep, Oct, Nov -> Fall 2022
  const date = new Date();
  switch (date.getMonth() + 1) {
    case 1:
    case 2:
      return `Winter ${date.getFullYear() - 1}`;
    case 3:
    case 4:
    case 5:
      return `Spring ${date.getFullYear()}`;
    case 6:
    case 7:
    case 8:
      return `Summer ${date.getFullYear()}`;
    case 9:
    case 10:
    case 11:
      return `Fall ${date.getFullYear()}`;
    case 12:
      return `Winter ${date.getFullYear()}`;
  }
}

app.get('/like', async (req, res) => {
  // Like 
  try {
    await likePlayingTrack();
    res.send("Liked track!");
  } catch (err) {
    console.log(err);
    res.send("Something went wrong");
  }
});

app.get('/authorize', (req, res) => {
  var authorizeUrl = spotifyApi.createAuthorizeURL(scopes, 'state_init');
  res.send(`Authorization URL: ${authorizeUrl}`);
});

app.get('/callback', (req, res) => {
  let code = req.query.code
  console.log("Got code, requesting tokens...")

  spotifyApi.authorizationCodeGrant(code).then(
    async function (data) {
      console.log('The token expires in ' + data.body['expires_in']);
      console.log('The access token is ' + data.body['access_token']);
      console.log('The refresh token is ' + data.body['refresh_token']);

      // Set the access token on the API object to use it in later calls
      let accessToken = data.body['access_token'];
      let refreshToken = data.body['refresh_token'];

      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);
      await storage.setItem('accessToken', accessToken);
      await storage.setItem('refreshToken', refreshToken);

      res.send(`Tokens saved!`);
    },
    function (err) {
      console.log('Something went wrong!', err);
    }
  );
});

app.listen(PORT, HOST);
console.log(`Running a on http://${HOST}:${PORT}`);