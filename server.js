'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
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
  let accessToken = await storage.getItem('accessToken');
  let refreshToken = await storage.getItem('refreshToken');

  if (accessToken) spotifyApi.setAccessToken(accessToken);
  if (refreshToken) spotifyApi.setRefreshToken(refreshToken);
}

function sendWebhookNotification(event, message, details = {}) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const parsedUrl = new URL(webhookUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const payload = JSON.stringify({
      content: message,
      text: message,
      message: message,
      event: event,
      ...details
    });

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    };

    const req = client.request(options, (res) => {
      console.log(`Webhook notification dispatched (status: ${res.statusCode})`);
    });

    req.on('error', (e) => {
      console.error(`Error sending webhook notification: ${e.message}`);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('Webhook notification timed out');
    });

    req.write(payload);
    req.end();
  } catch (err) {
    console.error(`Failed to dispatch webhook notification: ${err.message}`);
  }
}

async function likePlayingTrack(retryCount = 0) {
  console.log('/like requested...')

  try {
    // Get currently playing track 
    let playingTrackData = await spotifyApi.getMyCurrentPlayingTrack();
    if (!playingTrackData.body || !playingTrackData.body.item) {
      const error = new Error("No track is currently playing on Spotify");
      error.statusCode = 404;
      throw error;
    }
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
        .filter(item => item !== null)
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
      try {
        let data = await spotifyApi.refreshAccessToken();
        console.log("Refreshed token. new token: " + JSON.stringify(data));
        spotifyApi.setAccessToken(data.body['access_token']);
        await storage.setItem('accessToken', data.body['access_token']);

        return await likePlayingTrack(++retryCount);
      } catch (refreshErr) {
        console.error("Failed to refresh access token:", refreshErr);
        const error = new Error("Authentication expired. Reauthorize at /authorize");
        error.statusCode = 401;
        throw error;
      }
    } else {
      throw err;
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
  try {
    await likePlayingTrack();
    res.send("Liked track!");
  } catch (err) {
    console.error("Error handling /like:", err);
    let statusCode = err.statusCode || 500;
    let event = 'LIKE_FAILED';
    let message = `Failed to like track. Error: ${err.message || err}`;
    let responseText = "Something went wrong";
    let extraDetails = {};

    if (statusCode === 401) {
      event = 'AUTH_EXPIRED';
      message = `Authentication expired. Reconnect at: ${process.env.HOST}:${process.env.PORT}/authorize`;
      responseText = "Authentication expired. Visit /authorize to reconnect.";
      extraDetails.authorizeUrl = `${process.env.HOST}:${process.env.PORT}/authorize`;
    } else if (statusCode === 404) {
      event = 'NO_TRACK_PLAYING';
      message = "No track is currently playing.";
      responseText = "No track is currently playing.";
    }

    sendWebhookNotification(event, message, {
      error: err.message || String(err),
      statusCode: statusCode,
      ...extraDetails
    });

    res.status(statusCode).send(responseText);
  }
});

app.get('/status', async (req, res) => {
  try {
    let authorizedAt = await storage.getItem('authorizedAt');
    let accessToken = await storage.getItem('accessToken');
    let refreshToken = await storage.getItem('refreshToken');
    let hasTokens = !!(accessToken && refreshToken);

    if (!hasTokens) {
      return res.status(200).json({
        status: 'unauthorized',
        authorized: false,
        message: 'No tokens found, authorize again.',
        authorizeUrl: `${process.env.HOST}:${process.env.PORT}/authorize`
      });
    }

    let tokenAgeDays = authorizedAt ? Math.floor((Date.now() - authorizedAt) / (1000 * 60 * 60 * 24)) : null;
    let expiresInDays = authorizedAt ? Math.max(0, 180 - tokenAgeDays) : null;
    let isExpired = expiresInDays !== null && expiresInDays === 0;

    res.status(200).json({
      status: isExpired ? 'expired' : 'ok',
      authorized: !isExpired,
      tokenAgeDays,
      expiresInDays,
      authorizeUrl: `${process.env.HOST}:${process.env.PORT}/authorize`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/authorize', (req, res) => {
  var authorizeUrl = spotifyApi.createAuthorizeURL(scopes, 'state_init');
  res.redirect(authorizeUrl);
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
      let authorizedAt = Date.now();

      spotifyApi.setAccessToken(accessToken);
      spotifyApi.setRefreshToken(refreshToken);
      await storage.setItem('accessToken', accessToken);
      await storage.setItem('refreshToken', refreshToken);
      await storage.setItem('authorizedAt', authorizedAt);

      res.send(`Tokens saved!`);
    },
    function (err) {
      console.log('Something went wrong!', err);
      res.status(500).send('Something went wrong authorizing with Spotify.');
    }
  );
});

app.listen(PORT, HOST);
console.log(`Running a on http://${HOST}:${PORT}`);