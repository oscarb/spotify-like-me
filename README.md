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

Follow these simple steps to have the server connect to your Spotify account.

1. Open a browser and navigate to http://localhost:5000/authorize 
2. Open the authorization link given to you in a new tab
3. Sign into Spotify if required and approve the app permissions

Voila! 🎉  The server should now be authorized on behalf of your account and ready to start liking songs and manage playlists for you.

#### Note on security 

As of now, there's no security built-in so if your server is exposed to the internet it means that anyone could in theory start liking tracks you currently listen to. Either make sure the server is only reachable in the local network and used locally or set up some proxy server which handles security for you. 

### Start liking music

1. Start listening to music on Spotify
2. Whenever you hear something good, fire a `GET` request to `http://localhost:5000/like`
3. Watch as playlists and like status are magically updated in Spotify


## Real life examples

Some suggestions on how this can be used.

### Flic

Get a [Flic](https://flic.io/) button and set it up to do a **GET** request to `/like` whenever the button is clicked, double-clicked or held. No more need to be nearby a phone or computer to make sure that aweseome track doesn't go unnoticed! 

### Stream Deck

### Tasker
