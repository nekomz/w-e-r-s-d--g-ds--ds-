module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix, commandData) => {
	if(suffix) {
		var rankDocument = serverDocument.config.ranks_list.id(suffix);
		if(rankDocument) {
			var info = getRankText(rankDocument._id);
			if(info) {
				msg.channel.createMessage("**🏆 " + rankDocument._id + " (" + rankDocument.max_score + ")**\n\t" + info);
			} else {
				msg.channel.createMessage("No one on the server has the rank `" + rankDocument._id + "`...yet 🤐");
			}
		} else if(suffix.toLowerCase()=="me") {
			msg.channel.createMessage("You have the rank `" + memberDocument.rank + "` 🏆");
		} else {
			var member = bot.memberSearch(suffix, msg.guild);
			if(member) {
				if(member.user.bot) {
					msg.channel.createMessage("All robots are created equal 🤖😡");
				} else {
					var targetMemberDocument = serverDocument.members.id(member.id);
					if(targetMemberDocument && targetMemberDocument.rank) {
						msg.channel.createMessage("**@" + bot.getName(msg.guild, serverDocument, member) + "** has the rank `" + targetMemberDocument.rank + "` 🏆");
					} else {
						msg.channel.createMessage("**@" + bot.getName(msg.guild, serverDocument, member) + "** doesn't have a rank yet");
					}
				}
				return;
			}

			winston.warn("Invalid parameters '" + suffix + "' provided for " + commandData.name + " command", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
			msg.channel.createMessage("No such rank `" + suffix + "` exists. An admin can create one, though 😛");
		}
	} else {
		var info = [];
		for(var i=serverDocument.config.ranks_list.length-1; i>=0; i--) {
			var rankText = getRankText(serverDocument.config.ranks_list[i]._id);
			if(rankText) {
				info.push("**🏆 " + serverDocument.config.ranks_list[i]._id + " (" + serverDocument.config.ranks_list[i].max_score + ")**\n\t" + rankText);
			}
		}
		bot.sendArray(msg.channel, info);
	}

	function getRankText(rank) {
		return msg.guild.members.filter(member => {
			var targetMemberDocument = serverDocument.members.id(member.id);
			return targetMemberDocument && targetMemberDocument.rank==rank;
		}).map(member => {
			return "@" + bot.getName(msg.guild, serverDocument, member);
		}).sort().join("\n\t");
	}
};