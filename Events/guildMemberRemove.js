// Member left server
module.exports = (bot, db, config, winston, svr, member) => {
	// Get server data
	db.servers.findOne({_id: svr.id}, (err, serverDocument) => {
		if(!err && serverDocument) {
			// Remove member translated messages
			if(serverDocument.config.translated_messages) { 
				var memberTranslatedMessages = serverDocument.config.translated_messages.id(member.id);
				if(memberTranslatedMessages) {
					memberTranslatedMessages.remove();
				}
			}

			// Remove member data in channels (input and filters)
			for(var i=0; i<serverDocument.channels.length; i++) {
				var dataToRemove = serverDocument.channels[i].spam_filter_data.id(member.id);
				if(dataToRemove) {
					dataToRemove.remove();
				}
			}

			// Save changes to serverDocument
            serverDocument.save(err => {
        		if(err) {
        			winston.error("Failed to save server data for serverMemberRemoved", {svrid: svr.id}, err);
        		}
            });

			if(serverDocument.config.moderation.isEnabled) {
				// Send member_removed_message if necessary
				if(serverDocument.config.moderation.status_messages.member_removed_message.isEnabled) {
					winston.info("Member '" + member.user.username + "' removed from server '" + svr.name + "'", {svrid: svr.id, usrid: member.id});
					var ch = svr.channels.get(serverDocument.config.moderation.status_messages.member_removed_message.channel_id);
					if(ch) {
						var channelDocument = serverDocument.channels.id(ch.id);
						if(!channelDocument || channelDocument.bot_enabled) {
							ch.createMessage(serverDocument.config.moderation.status_messages.member_removed_message.messages.random().replaceAll("@user", "**@" + bot.getName(svr, serverDocument, member) + "**"));
						}
					}
				}

				// Send member_removed_pm if necessary
				if(serverDocument.config.moderation.status_messages.member_removed_pm.isEnabled && !member.user.bot) {
					member.user.getDMChannel().createMessage(serverDocument.config.moderation.status_messages.member_removed_pm.message_content);
				}
			}
		} else {
			winston.error("Failed to find server data for serverMemberRemoved", {svrid: svr.id}, err);
		}
	});
};