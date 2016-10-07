const moment = require("moment");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg) => {
    msg.channel.createMessage([
		"__" + msg.guild.name + "__",
		"**ID:** " + msg.guild.id,
		"**Created:** " + moment(msg.guild.createdAt).fromNow(),
		"**Owner:** @" + bot.getName(msg.guild, serverDocument, msg.guild.members.get(msg.guild.ownerID)),
		"**Members:** " + msg.guild.members.size,
		"**Icon:** " + (msg.guild.iconURL || "None"),
		"**Command Prefix:** `" + bot.getCommandPrefix(msg.guild, serverDocument) + "`",
		"**Messages:** " + serverDocument.messages_today + " today",
		"**Category:** " + serverDocument.config.public_data.server_listing.category,
		"<" + config.hosting_url + "activity/servers?q=" + msg.guild.name + ">"
    ].join("\n"));
};