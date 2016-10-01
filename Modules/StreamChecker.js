const auth = require("./../Configuration/auth.json");
const unirest = require("unirest");

// Checks if a user is streaming on Twitch, YouTube Gaming, or HitBox and posts message in server channel if necessary
module.exports = (winston, svr, streamerDocument, callback) => {
	isStreaming(streamerDocument.type, streamerDocument._id, function(data) {
		var updated = false;

		// Send status message if stream started
		if(data && !streamerDocument.live_state) {
			winston.info("Streamer '" + streamerDocument._id + "' started streaming", {svrid: svr.id}, err);
			var ch = streamerDocument.channel_id ? svr.channels.get(streamerDocument.channel_id) : svr.defaultChannel;
			if(ch) {
				var channelDocument = serverDocument.channels.id(ch.id);
				if(!channelDocument || channelDocument.bot_enabled) {
					ch.createMessage(":arrow_forward: **" + data.name + "** started streaming on " + data.type + ": " + data.game + "\n" + data.url);
				}
			}
		// Update live_state if stream ended
		} else if(!data && streamerDocument.live_state) {
			streamerDocument.live_state = false;
		}

		// Save streamerDocument if necessary
		if(updated) {
			streamerDocument.save(err => {
                if(err) {
                    winston.error("Failed to save data for streamer '" + streamerDocument._id + "'", {svrid: svr.id}, err);
                }
            });
		}

		callback();
	});
};

function isStreaming(type, username, callback) {
	username = encodeURI(username.replaceAll("&", ""));
	switch(type) {
		case "twitch":
			isStreamingTwitch(username, callback);
			break;
		case "ytg":
			isStreamingYoutube(username, callback);
			break;
	}
}

function isStreamingTwitch(username, callback) {
	unirest.get("https://api.twitch.tv/kraken/streams/" + username + "?client_id=" + auth.tokens.twitch_client_id).header("Accept", "application/json").end(res => {
		if(res.status==200 && res.body && res.body.stream) {
			callback({
				name: res.body.stream.channel.display_name,
				type: "Twitch",
				game: res.body.stream.game,
				url: res.body.stream.channel.url
			});
		} else {
			callback();
		}
	});
}

function isStreamingYoutube(channel, callback) {
	unirest.get("https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=" + channel + "&type=video&eventType=live&key=" + auth.tokens.google_api_key).header("Accept", "application/json").end(res => {
		if(res.status==200 && res.body && res.body.items.length>0 && res.body.items[0].snippet.liveBroadcastContent=="live") {
			callback({
				name: res.body.items[0].snippet.channelTitle,
				type: "YouTube",
				game: res.body.items[0].snippet.title,
				url: "https://www.youtube.com/watch?v=" + res.body.items[0].id.videoId
			});
		} else {
			callback();
		}
	});
}