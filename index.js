const discord = require('discord.js');
const client = new discord.Client();
const fs = require("fs");
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const ytdl = require('ytdl-core');

setTimeout(() => {
    console.log("Mem usage", process.memoryUsage().heapUsed);
}, 1000);

function start() {
    let playlists = {};
    let currentPlaylist, songId, voiceConnection, playMode = "consequent", currentStream;
    let bannedIds = [];

    const Playlists = Object.freeze({
        save() {
            fs.writeFile("playlists.save", JSON.stringify(playlists), (e) => {
                if (e) throw e
            });
        },
        create(name) {
            if (playlists[name]) return false;
            playlists[name] = [];
            Playlists.save();
            return true;
        },
        addSong(name, song) {
            if (!playlists[name]) return false;
            playlists[name].push(song);
            Playlists.save();
            return true;
        },
        deleteSong(name, song) {
            if (!playlists[name]) return false;
            if (playlists[name].indexOf(song) === -1) return false;
            playlists[name] = playlists[name].filter(s => s !== song);
            Playlists.save();
            return true;
        },
        deletePlaylist(name) {
            if (!playlists[name]) return false;
            delete playlists[name];
            Playlists.save();
            return true;
        },
        load() {
            try {
                let content = fs.readFileSync("playlists.save");
                playlists = JSON.parse(content.toString())
            } catch (e) {
                console.log(e);
                playlists = {};
            }
        }
    });
    Playlists.load();

    const commandProcessor = new (require('./command_processor'))([
        {
            name: "say",
            description: "Writes down all the arguments given",
            adminOnly: false,
            usage: "-say 'arg1' 'arg2' ...",
            action: function (msg, arguments) {
                arguments.forEach(arg => {
                    msg.reply(arg.value)
                });
            }
        },
        {
            name: "help",
            description: "Helps with understanding commands :)",
            usage: "help ?command",
            adminOnly: false,
            action: function (msg, arguments, self) {
                if (arguments.length === 0) {
                    let string = 'All commands list:\n\t';
                    let commandNames = [];
                    self.commands.forEach(command => {
                        commandNames.push(command.name)
                    });
                    string += commandNames.join('\n\t');
                    msg.reply(string);
                } else if (arguments.length === 1) {
                    let command = arguments[0].value;
                    let commandObject;
                    self.commands.forEach(comm => {
                        if (comm.name === command.toLowerCase()) commandObject = comm;
                    });
                    if (typeof commandObject === "undefined") throw {message: "Such a command doesn't exist"};
                    let string = "Command name: " + commandObject.name + "\nCommand description: " + commandObject.description + "\nCommand usage: " + commandObject.usage + (commandObject.adminOnly ? "\nAdmin only!" : "");
                    msg.reply(string);
                }
            }
        },
        {
            name: "create_playlist",
            description: "Creates a playlist",
            adminOnly: false,
            usage: "-create_playlist 'name'",
            action: function (msg, arguments) {
                if (arguments.length < 1) {
                    msg.reply("Usage: -create_playlist 'name'");
                    return;
                }
                let name = arguments.shift().value;
                let result = Playlists.create(name);
                if (result) {
                    msg.reply(`Playlist '${name}' created!`);
                } else {
                    msg.reply(`Playlist '${name}' already exists!`);
                }
            }
        },
        {
            name: "add_to_playlist",
            description: "Adds a song by youtube ID to a playlist",
            adminOnly: false,
            usage: "-add_to_playlist 'name' 'youtube id'",
            action: function (msg, arguments) {
                if (arguments.length < 2) {
                    msg.reply("Usage: -add_to_playlist 'name' 'youtube id'");
                    return;
                }
                let name = arguments.shift().value;
                let id = arguments.shift().value;
                if (!id.match(/^[a-zA-Z0-9-_]{11}$/)) {
                    msg.reply(`${id} is not a youtube video id`);
                    return;
                }
                let url = `https://www.youtube.com/watch?v=${id}`;
                let result = Playlists.addSong(name, url);
                if (result) {
                    msg.reply(`Song '${url}' added to playlist '${name}'!`);
                } else {
                    msg.reply(`Playlist '${name}' does not exist!`);
                }
            }
        },
        {
            name: "delete_from_playlist",
            description: "Deletes a song from a playlist by ID",
            adminOnly: false,
            usage: "-delete_from_playlist 'name' 'youtube ID'",
            action: function (msg, arguments) {
                if (arguments.length < 2) {
                    msg.reply("Usage: -delete_from_playlist 'name' 'youtube ID'");
                    return;
                }
                let name = arguments.shift().value;
                let id = arguments.shift().value;
                if (!id.match(/^[a-zA-Z0-9-_]{11}$/)) {
                    msg.reply(`${id} is not a youtube video id`);
                    return;
                }
                let result = Playlists.deleteSong(name, `https://www.youtube.com/watch?v=${id}`);
                if (result) {
                    msg.reply(`Song '${url}' deleted from playlist '${name}'!`);
                } else {
                    msg.reply(`Playlist '${name}' does not exist or song '${name}' is not on this playlist!`);
                }
            }
        },
        {
            name: "delete_playlist",
            description: "Deletes a playlist",
            adminOnly: false,
            usage: "-delete_playlist 'name'",
            action: function (msg, arguments) {
                if (arguments.length < 1) {
                    msg.reply("Usage: -delete_playlist 'name'");
                    return;
                }
                let name = arguments.shift().value;
                let result = Playlists.deletePlaylist(name);
                if (result) {
                    msg.reply(`Playlist '${name}' deleted!`);
                } else {
                    msg.reply(`Playlist '${name}' does not exist!`);
                }
            }
        },
        {
            name: "playlist_songs",
            description: "Prints all songs from a playlist",
            adminOnly: false,
            usage: "-playlist_songs 'name'",
            action: function (msg, arguments) {
                if (arguments.length < 1) {
                    msg.reply("Usage: -playlist_songs 'name'");
                    return;
                }
                let name = arguments.shift().value;
                if (!playlists[name]) {
                    msg.reply(`Playlist '${name}' does not exist!`);
                    return;
                }
                msg.reply(`Songs from playlist '${name}': '${playlists[name].join("', '")}'`);
            }
        },
        {
            name: "playlists",
            description: "Prints all playlists",
            adminOnly: false,
            usage: "-playlists",
            action: function (msg) {
                let reply = "Playlists:";
                for (let name in playlists) if (playlists.hasOwnProperty(name)) {
                    reply += "\n" + name;
                }
                msg.reply(reply);
            }
        },
        {
            name: "select_channel",
            description: "Goes to the channel",
            adminOnly: false,
            usage: "-select_channel 'id'",
            action: async function (msg, arguments) {
                if (arguments.length < 1) {
                    msg.reply("Usage: -select_channel 'id'");
                    return;
                }
                let id = arguments.shift().value;
                if (voiceConnection) {
                    if (voiceConnection.channel.id === id)  {
                        msg.reply(`I'm already in ${id}`);
                        return;
                    }
                    voiceConnection.on("disconnect", async () => {
                        let newConnection;
                        try {
                            newConnection = await (await client.channels.fetch(id)).join();
                        } catch (e) {
                            msg.reply(`An error occurred: ${e.toString()}`);
                            return;
                        }
                        voiceConnection = newConnection;
                        msg.reply(`Successfully connected to ${id}`);
                        playSong();
                    });
                    voiceConnection.disconnect();
                } else {
                    let newConnection;
                    try {
                        newConnection = await (await client.channels.fetch(id)).join();
                    } catch (e) {
                        msg.reply(`An error occurred: ${e.toString()}`);
                        return;
                    }
                    voiceConnection = newConnection;
                    msg.reply(`Successfully connected to ${id}`);
                    playSong();
                }
            }
        },
        {
            name: "disconnect",
            description: "Disconnects from the current channel",
            adminOnly: false,
            usage: "-disconnect",
            action: function (msg, arguments) {
                if (voiceConnection) voiceConnection.disconnect();
                else {
                    msg.reply(`Connection is not established`);
                    return;
                }
                voiceConnection = undefined;
                currentPlaylist = undefined;
                songId = undefined;
                msg.reply(`Successfully disconnected!`);
                playSong();
            }
        },
        {
            name: "play_next",
            description: "Plays the next song",
            adminOnly: false,
            usage: "-play_next",
            action: function (msg, arguments) {
                if (currentPlaylist && typeof songId !== "undefined") {
                    playSong(msg);
                } else {
                    msg.reply(`Playlist is not defined`);
                }
            }
        },
        {
            name: "stop",
            description: "Stops playing",
            adminOnly: false,
            usage: "-stop",
            action: function (msg, arguments) {
                currentPlaylist = undefined;
                songId = undefined;
                currentStream.destroy();
            }
        },
        {
            name: "play_playlist",
            description: "Plays a playlist",
            adminOnly: false,
            usage: "-play_playlist 'name'",
            action: function (msg, arguments) {
                if (arguments.length < 1) {
                    msg.reply("Usage: -play_playlist 'name'");
                    return;
                }
                let name = arguments.shift().value;
                if (playlists[name]) {
                    currentPlaylist = name;
                    songId = undefined;
                    playSong(msg);
                } else {
                    msg.reply(`Playlist '${name}' does not exist!`);
                }
            }
        },
        {
            name: "set_play_mode",
            description: "Sets the play mode",
            adminOnly: false,
            usage: "-set_play_mode 'consequent|random'",
            action: function (msg, arguments) {
                if (arguments.length < 1) {
                    msg.reply("Usage: -set_play_mode 'consequent|random'");
                    return;
                }
                let mode = arguments.shift().value;
                if (mode === "consequent" || mode === "random") {
                    playMode = mode;
                    msg.reply(`Mode '${mode}' is set!`);
                } else {
                    msg.reply(`Mode '${mode}' does not exist!`);
                }
            }
        },
    ]);

    client.on('message', msg => {
        if (msg.author.bot) return;
        if (msg.content.indexOf('-') !== 0) return;
        if (msg.channel.id !== "710156576257867849")
        //msg.reply(msg.content.slice(1));
            console.log(msg.author.tag + ': ' + msg.content.slice(1));
        try {
            commandProcessor.process(msg.content.slice(1), msg);
        } catch (e) {
            console.log(e);
            msg.reply(e.message);
        }
    });
    
    function createYoutubeStream(url, count) {
        return new Promise((resolve, reject) => {
            if (typeof count !== "number") count = 0;
            if (count > 10) reject(new Error(`Failed to fetch ${url}, are you sure it is right?`));
            let stream = ytdl(url, {
                filter: "audioonly",
                quality: "highestaudio",
                highWaterMark: 1 << 25
            });
            let success = false;
            stream.on("error", () => {
                if (!success) createYoutubeStream(url, count+1).then(resolve).catch(reject);
            });
            stream.on("response", () => {
                success = true;
                resolve(stream);
            });
        });
    }

    function playSong(msg) {
        if (currentPlaylist) {
            if (playlists[currentPlaylist]) {
                let playlist = playlists[currentPlaylist];
                if (playlist.length > 0) {
                    if (typeof songId === "undefined") {
                        songId = 0;
                    } else if (playMode === "consequent") {
                        songId = songId + 1;
                    } else if (playMode === "random") {
                        songId = Math.floor(Math.random() * playlist.length);
                    }
                    if (songId >= playlist.length) songId = 0;
                    let url = playlist[songId];
                    if (voiceConnection) {
                        if (msg) msg.reply(`Playing ${url}`);
                        try {
                            if (currentStream && !currentStream.destroyed) currentStream.destroy();
                            createYoutubeStream(url).then(stream => {
                                currentStream = stream.on("error", err => {
                                    msg.reply(`Error: ${err.toString()}`);
                                });
                                voiceConnection.play(currentStream).on("error", err => msg.reply(`Error: ${err.toString()}`)).on("speaking", (speaking) => {
                                    if (!speaking) {
                                        playSong(msg);
                                    }
                                });
                            }).catch(err => {
                                msg.reply(`Error: ${err.toString()}`);
                            })

                        } catch (err) {
                            msg.reply(`Error: ${err.toString()}`);
                        }
                    } else {
                        if (msg) msg.reply(`Please connect this bot to a channel via -select_channel`);
                    }
                } else {
                    if (msg) msg.reply(`Playlist ${currentPlaylist} is empty`);
                }
            } else {
                if (msg) msg.reply(`The playlist ${currentPlaylist} does not exist`);
            }
        }
    }

    client.login(process.argv[2]);
}

function tryStart() {
    try {
        start();
    } catch (e) {
        console.log(e);
        tryStart();
    }
}

tryStart();