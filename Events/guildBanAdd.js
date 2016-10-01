// User banned from server
module.exports = (bot, db, config, winston, svr, member) => {
	db.servers.findOne({_id: svr.id}, (err, serverDocument) => {
		if(!err && serverDocument) {
			if(serverDocument.config.moderation.isEnabled && serverDocument.config.moderation.status_messages.member_banned_message.isEnabled) {
				winston.info("Member '" + member.user.username + "' banned from server '" + svr.name + "'", {svrid: svr.id, usrid: member.id});
				var ch = svr.channels.get(serverDocument.config.moderation.status_messages.member_banned_message.channel_id);
				if(ch) {
					var channelDocument = serverDocument.channels.id(ch.id);
					if(!channelDocument || channelDocument.bot_enabled) {
						var toSend = serverDocument.config.moderation.status_messages.member_banned_message.messages[getRandomInt(0, serverDocument.config.moderation.status_messages.member_banned_message.messages.length-1)].replaceAll("@user", "**@" + bot.getName(svr, serverDocument, member) + "**");
						var banDocument = serverDocument.member_banned_data.id(member.id);
						if(banDocument) {
							var creator = svr.members.get(banDocument.creator_id);
							if(creator) {
								toSend += "\n\nBanned by **@" + bot.getName(svr, serverDocument, member) + "**" + (banDocument.reason ? (", reason: " + banDocument.reason) : "");
							}
							banDocument.remove();
							serverDocument.save(err => {
								winston.error("Failed to save banned members data", {svrid: svr.id}, err);
							});
						}
						ch.createMessage(toSend);
					}
				}
			}
		} else {
			winston.error("Failed to find server data for serverMemberBanned", {svrid: svr.id}, err);
		}
	});
};

// Get a random integer in specified range, inclusive
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}