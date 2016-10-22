const moment = require("moment");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg) => {
	var now = new Date();
	var next = new Date(now.getFullYear()+1, 0, 1, 0, 0, 0, 0);
	msg.channel.createMessage(moment.duration(next - now).humanize() + " until " + (now.getFullYear()+1) + "! 🗓");
};