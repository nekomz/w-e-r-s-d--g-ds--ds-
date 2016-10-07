const runExtension = require("./../Modules/ExtensionRunner.js");
const checkFiltered = require("./../Modules/FilterChecker.js");

// Message updated (edited, pinned, etc.)
module.exports = (bot, db, config, winston, msg, oldmsgdata) => {
	if(msg && oldmsgdata && msg.guild && msg.author.id!=bot.user.id && !msg.author.bot) {
        // Get server data
		db.servers.findOne({_id: msg.guild.id}, (err, serverDocument) => {
			if(!err && serverDocument) {
				// Message content (clean) changed
				if(oldmsgdata.cleanContent && msg.cleanContent && oldmsgdata.cleanContent!=msg.cleanContent) {
					const memberBotAdmin = bot.getUserBotAdmin(msg.guild, serverDocument, msg.member);

					// Send message_edited_message if necessary
	                if(serverDocument.config.moderation.isEnabled && serverDocument.config.moderation.status_messages.message_edited_message.isEnabled) {
	                    winston.info("Message by member '" + msg.author.username + "' on server '" + msg.guild.name + "' edited", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});

	                    // Send message in different channel
	                    if(serverDocument.config.moderation.status_messages.message_edited_message.channel_id) {
	                    	var ch = msg.guild.channels.get(serverDocument.config.moderation.status_messages.message_edited_message.channel_id);
	                    	if(ch) {
	                    		var targetChannelDocument = serverDocument.channels.id(ch.id);
	                    		if(!targetChannelDocument || targetChannelDocument.bot_enabled) {
	                    			ch.createMessage("Message by **@" + bot.getName(msg.guild, serverDocument, msg.member) + "** in #" + msg.channel.name + " edited. Original:\n```" + oldmsgdata.cleanContent + "```Updated:\n```" + msg.cleanContent + "```", {disable_everyone: true});
	                    		}
	                    	}
	                    // Send message in same channel
	                	} else if(serverDocument.config.moderation.status_messages.message_edited_message.enabled_channel_ids.indexOf(msg.channel.id)>-1) {
							var channelDocument = serverDocument.channels.id(msg.channel.id);
							if(!channelDocument || channelDocument.bot_enabled) {
								msg.channel.createMessage("Message by **@" + bot.getName(msg.guild, serverDocument, msg.member) + "** edited. Original:\n```" + oldmsgdata.cleanContent + "```Updated:\n```" + msg.cleanContent + "```", {disable_everyone: true});
							}
	                	}
	                }

	                // Check if using a filtered word again
	                if(checkFiltered(serverDocument, msg.channel, msg.cleanContent, false, true)) {
						// Delete offending message if necessary
						if(serverDocument.config.moderation.filters.custom_filter.delete_message) {
							msg.delete().then().catch(err => {
								winston.error("Failed to delete filtered message from member '" + msg.author.username + "' in channel '" + msg.channel.name + "' on server '" + msg.guild.name + "'", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id}, err);
							});
						}

						// Handle this as a violation
						bot.handleViolation(winston, msg.guild, serverDocument, msg.channel, msg.member, userDocument, memberDocument, "You used a filtered word in #" + msg.channel.name + " on " + msg.guild.name, "**@" + bot.getName(svr, serverDocument, msg.member, true) + "** used a filtered word (edited: `" + msg.cleanContent + "`) in #" + msg.channel.name + " on " + msg.guild.name, "Word filter violation (edited: \"" + msg.cleanContent + "\") in #" + msg.channel.name, serverDocument.config.moderation.filters.custom_filter.action, serverDocument.config.moderation.filters.custom_filter.violator_role_id);
					}

	                // Apply keyword extensions again
	                for(var i=0; i<serverDocument.extensions.length; i++) {
						if(serverDocument.extensions[i].type=="keyword" && memberBotAdmin>=serverDocument.extensions[i].admin_level && serverDocument.extensions[i].enabled_channel_ids.indexOf(msg.channel.id)>-1) {
							var keywordMatch = msg.content.containsArray(serverDocument.extensions[i].keywords, serverDocument.extensions[i].case_sensitive);
							if(((serverDocument.extensions[i].keywords.length>1 || serverDocument.extensions[i].keywords[0]!="*") && keywordMatch.selectedKeyword>-1) || (serverDocument.extensions[i].keywords.length==1 && serverDocument.extensions[i].keywords[0]=="*")) {
								winston.info("Treating '" + msg.cleanContent + "' as a trigger for keyword extension '" + serverDocument.extensions[i].name + "'", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
								extensionApplied = true;
								runExtension(bot, db, winston, msg.guild, serverDocument, msg.channel, serverDocument.extensions[i], msg, null, keywordMatch);
							}
						}
					}
	            }
			} else {
				winston.error("Failed to find server data for message", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id}, err);
			}
		});
    }
};

// Check if string contains at least one element in array
String.prototype.containsArray = (arr, isCaseSensitive) => {
	var selectedKeyword = -1;
	var keywordIndex = -1;
	for(var i=0; i<arr.length; i++) {
		if(isCaseSensitive && this.contains(arr[i])) {
			selectedKeyword = i;
			keywordIndex = this.indexOf(arr[i]);
			break;
		} else if(!isCaseSensitive && this.toLowerCase().contains(arr[i].toLowerCase())) {
			selectedKeyword = i;
			keywordIndex = this.toLowerCase().indexOf(arr[i].toLowerCase());
			break;
		}
	}
	return {
		selectedKeyword: selectedKeyword,
		keywordIndex: keywordIndex
	};
};