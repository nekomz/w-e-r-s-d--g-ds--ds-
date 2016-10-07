module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix, commandData) => {
	if(suffix) {
		var info = [];
		var pmcommand = bot.getPMCommandMetadata(suffix);
		if(command) {
			info.push(getCommandHelp(suffix, "PM", pmcommand.usage));
		}
		var publiccommand = bot.getPublicCommandMetadata(suffix);
		if(publiccommand) {
			info.push(getCommandHelp(suffix, "public", publiccommand.usage));
		}
		if(info.length==0) {
			info.push("No such command `" + suffix + "`");
		}
		bot.sendArray(msg.channel, info);
	} else {
		msg.channel.createMessage("https://awesomebot.xyz/wiki");
	}
};

function getCommandHelp(name, type, usage) {
	return "__Help for " + type + " command **" + name + "**__\n" + (usage ? ("Usage: `" + usage + "`\n") : "") + "<https://awesomebot.xyz/wiki/Commands#" + name + ">";
}