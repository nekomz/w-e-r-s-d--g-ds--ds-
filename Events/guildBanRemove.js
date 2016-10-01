// User unbanned from server
module.exports = (bot, db, config, winston, svr, member) => {
	db.servers.findOne({_id: svr.id}, (err, serverDocument) => {
		if(!err && serverDocument) {
			if(serverDocument.config.moderation.isEnabled && serverDocument.config.moderation.status_messages.member_unbanned_message.isEnabled) {
				winston.info("Member '" + member.user.username + "' unbanned from server '" + svr.name + "'", {svrid: svr.id, usrid: member.id});
				var ch = svr.channels.get(serverDocument.config.moderation.status_messages.member_unbanned_message.channel_id);
				if(ch) {
					var channelDocument = serverDocument.channels.id(ch.id);
					if(!channelDocument || channelDocument.bot_enabled) {
						ch.createMessage(serverDocument.config.moderation.status_messages.member_unbanned_message.messages[getRandomInt(0, serverDocument.config.moderation.status_messages.member_unbanned_message.messages.length-1)].replaceAll("@user", "**@" + bot.getName(svr, serverDocument, member) + "**"));
					}
				}
			}
		} else {
			winston.error("Failed to find server data for userUnbanned", {svrid: svr.id}, err);
		}
	});
};

// Get a random integer in specified range, inclusive
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}