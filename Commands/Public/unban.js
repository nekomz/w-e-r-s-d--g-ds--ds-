const ModLog = require("./../../Modules/ModerationLogging.js");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix, commandData) => {
	if(suffix) {
		msg.guild.getBans().then(users => {
			if(suffix.indexOf("|")>-1 && suffix.length>3) {
				var query = suffix.substring(0, suffix.indexOf("|")).trim();
				var reason = suffix.substring(suffix.indexOf("|")+1).trim();
			} else {
				var query = suffix;
				var reason;
			}

			var usr = users.find(usr => {
				return usr.username==query || usr.id==query;
			});
			if(usr) {
				msg.guild.unbanMember(usr.id).then(() => {
					msg.channel.createMessage("**@" + bot.getName(msg.guild, serverDocument, {user: usr}, true) + "** is no longer banned 🚪");
					ModLog.create(msg.guild, serverDocument, "Unban", {user: usr}, msg.member, reason);
				}).catch(err => {
					winston.error("Failed to unban user '" + usr.username + "' from server '" + msg.guild.name + "'", {svrid: msg.guild.name, usrid: member.id}, err);
					msg.channel.createMessage("I couldn't unban **@" + bot.getName(msg.guild, serverDocument, {user: usr}, true) + "** 😩");
				});
			} else {
				msg.channel.createMessage("I couldn't find a matching banned user on this server.");
			}
		}).catch();
	} else {
		msg.channel.createMessage("Huh? Unban what?!");
	}
};