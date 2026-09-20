# Spotify Like Me 🎶💚

One **GET** request to like the playing track and add the album tracks to various playlists, just _like me_ whenever an awesome track shows up on Spotify.

Whenever the `/like` endpoint is requested, the server will:

* Add the currently playing Spotify track to the library, i.e. give the track a 💚 
* Add all the tracks from the same album to a seasonal playlist (_Fall 2021_, _Winter 2021_...) and create the playlist if it doesn't already exist
* Add all the tracks from the same album to the playlists configured in `./config.js`

## Getting started

### Create Spotify app

Go to [Spotify Dashboard](https://developer.spotify.com/dashboard/applications) and create a new app. Make note of the *Client ID* and the *Client Secret*. Click _edit settings_ and in *Redirect URIs* add the URL where the server will be hosted suffixed with `/callback`. 

**Example**
```
http://192.168.1.10:50000/callback
```

Make sure to save afterwards.


### Download and configure server

Make sure to clone the repository:
```
git clone https://github.com/oscarb/spotify-like-me.git
```

Create a `.env`-file and configure it similar to `.env.sample`. Do the same for `./config.js` where a list of playlists to update goes.

### Start server

#### Docker

Build container 
```
docker build . -t oscarb/spotify-like-me
```

Start the container 
```
docker run -v /path/to/local/spotify-like-me:/usr/src/app -p 50000:8080 --env-file ./.env -d oscarb/spotify-like-me
```

### Authorize

Spotify refresh tokens expire every 6 months, and Spotify requires redirect URIs to use HTTPS or the loopback address `127.0.0.1`.

1. In your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), add `http://127.0.0.1:50000/callback` (replace with your port) to **Redirect URIs**.
2. Open a browser and navigate to `http://<HOST>:<PORT>/authorize`.
3. It will automatically redirect you to Spotify to approve permissions.
4. Spotify redirects back to `/callback`, and you'll see `Tokens saved!`.

### Status & Health Check

You can check the status and remaining days before token expiration at `GET /status`:

```json
{
  "status": "ok",
  "authorized": true,
  "tokenAgeDays": 5,
  "expiresInDays": 175,
  "authorizeUrl": "http://127.0.0.1:50000/authorize"
}
```

### Notifications (Optional)

You can configure an agnostic `WEBHOOK_URL` in `.env` to receive notifications when tokens expire or when a `/like` request fails:

```env
WEBHOOK_URL=http://homeassistant.local:8123/api/webhook/spotify_like_me
```

When an event occurs (such as `AUTH_EXPIRED`, `NO_TRACK_PLAYING`, or `LIKE_FAILED`), a `POST` request is sent with a universal JSON payload (`message`, `text`, `content`, `event`, `error`, `statusCode`, and `authorizeUrl`), compatible out of the box with Home Assistant, ntfy.sh, Discord, Slack, etc.

#### Note on security 

As of now, there's no security built-in so if your server is exposed to the internet it means that anyone could in theory start liking tracks you currently listen to. Either make sure the server is only reachable in the local network and used locally or set up some proxy server which handles security for you. 

### Start liking music

1. Start listening to music on Spotify
2. Whenever you hear something good, fire a `GET` request to `http://<HOST>:<PORT>/like`
3. Watch as playlists and like status are magically updated in Spotify

## Real life examples

Some suggestions on how this can be used.

### Flic

Get a [Flic](https://flic.io/) button and set it up to do a **GET** request to `/like` whenever the button is clicked, double-clicked or held. No more need to be nearby a phone or computer to make sure that awesome track doesn't go unnoticed! 

### Stream Deck

Set up a System > Website or API action to trigger `GET http://<HOST>:<PORT>/like`. If authorization fails, the server returns an HTTP 401, showing an error badge on the Stream Deck key.

### Tasker

