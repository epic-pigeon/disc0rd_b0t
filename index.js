const discord = require('discord.js');
const client = new discord.Client();
const fs = require("fs");
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const ytdl = require('ytdl-core');



let playlists = {};
let currentPlaylist, songId, voiceConnection, playMode = "consequent";
let bannedIds = [];

const Playlists = Object.freeze({
    save() {
        fs.writeFile("playlists.save", JSON.stringify(playlists), (e) => { if (e) throw e });
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
            arguments.forEach(arg => {msg.reply(arg.value)});
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
                self.commands.forEach(command => {commandNames.push(command.name)});
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
        description: "Adds a song to a playlist",
        adminOnly: false,
        usage: "-add_to_playlist 'name' 'youtube url'",
        action: function (msg, arguments) {
            if (arguments.length < 2) {
                msg.reply("Usage: -add_to_playlist 'name' 'youtube url'");
                return;
            }
            let name = arguments.shift().value;
            let url = arguments.shift().value;
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
        description: "Deletes a song from a playlist",
        adminOnly: false,
        usage: "-delete_from_playlist 'name' 'youtube url'",
        action: function (msg, arguments) {
            if (arguments.length < 2) {
                msg.reply("Usage: -delete_from_playlist 'name' 'youtube url'");
                return;
            }
            let name = arguments.shift().value;
            let url = arguments.shift().value;
            let result = Playlists.deleteSong(name, url);
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
                reply += "\n"+name;
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
            let newConnection;
            let id = arguments.shift().value;
            try {
                newConnection = await (await client.channels.fetch(id)).join();
            } catch (e) {
                msg.reply(`An error occurred: ${e.toString()}`);
                return;
            }
            if (voiceConnection) voiceConnection.disconnect();
            voiceConnection = newConnection;
            msg.reply(`Successfully connected to ${id}`);
            playSong();
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
                songId = 0;
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
            } else {
                msg.reply(`Mode '${mode}' does not exist!`);
            }
        }
    },
]);

client.on('message', msg => {
    if (msg.author.bot) return;
    if (msg.content.indexOf('-') !== 0) return;
    //msg.reply(msg.content.slice(1));
    console.log(msg.author.tag + ': ' + msg.content.slice(1));
    try {
        commandProcessor.process(msg.content.slice(1), msg);
    } catch (e) {
        console.log(e);
        msg.reply(e.message);
    }
});

function playSong(msg) {
    if (currentPlaylist && playlists[currentPlaylist]) {
        let playlist = playlists[currentPlaylist];
        if (playlist.length > 0) {
            if (typeof songId === "undefined") {
                songId = 0;
            } else if (playMode === "consequent") {
                songId = songId+1;
            } else if (playMode === "random") {
                songId = Math.floor(Math.random() * playlist.length);
            }
            if (songId >= playlist.length) songId = 0;
            let url = playlist[songId];
            if (msg) msg.reply(`Playing ${url}`);
            if (voiceConnection) {
                voiceConnection.play(ytdl(url, { filter: "audioonly", quality: "highestaudio", highWaterMark: 1 << 25 }).on("error", console.log)).on("speaking", (speaking) => {
                    console.log(speaking);
                    if (!speaking) playSong(msg);
                });
            } else {
                if (msg) msg.reply(`Please connect this bot to a channel via -select_channel`);
            }
        } else {
            if (msg) msg.reply(`Playlist ${currentPlaylist} is empty`);
        }
    } else {
        if (msg) msg.reply(`The playlist is either not specified or does not exist`);
    }
}

client.login(process.argv[2]);
