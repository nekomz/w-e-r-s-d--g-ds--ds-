const isStreaming = require("./StreamerUtils.js");

// Checks if a user is streaming on Twitch, YouTube Gaming, or HitBox and posts message in server channel if necessary
module.exports = (winston, svr, streamerDocument, callback) => {
	isStreaming(streamerDocument.type, streamerDocument._id, data => {
		var updated = false;

		// Send status message if stream started
		if(data && !streamerDocument.live_state) {
			winston.info("Streamer '" + streamerDocument._id + "' started streaming", {svrid: svr.id}, err);
			var ch = streamerDocument.channel_id ? svr.channels.get(streamerDocument.channel_id) : svr.defaultChannel;
			if(ch) {
				var channelDocument = serverDocument.channels.id(ch.id);
				if(!channelDocument || channelDocument.bot_enabled) {
					ch.createMessage("🎮 **" + data.name + "** started streaming on " + data.type + ": " + data.game + "\n" + data.url);
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