# Spotify Like Me

One `GET` request to like the playing track and add the album tracks to various playlists, just _like me_ whenever an awesome track shows up on Spotify.

Whenever the `/like` endpoint is requested, the server will:

* Add the currently playing Spotify track to the library, i.e. put a 💚 on it
* Add all the tracks from the same album to a seasonal playlist (_Fall 2021_, _Winter 2021_...) and create the playlist if it doesn't already exist
* Add all the tracks from the same album to the playlists configured in `./config.js`

## Getting started

### Create Spotify app

### Configuration

### Start server

You can run the server either as a docker container or using npm 

#### Docker


#### Docker Compose


#### Node

### Authorize 

### Note on security 


## Real life examples