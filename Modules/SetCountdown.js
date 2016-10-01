// Set countdown for a server
module.exports = (bot, winston, svrid, countdown) => {
	setTimeout(() => {
		var svr = bot.guilds.get(svrid);
		if(svr) {
			var ch = svr.channels.get(countdown.channel_id);
			if(ch) {
				ch.createMessage("3...2...1...**" + countdown.name + "**");
				countdown.remove().exec();
				winston.info("Countdown '" + coutndown.name + "' expired", {svrid: svr.id, chid: ch.id});
			}
		}
	}, countdown.expiry_timestamp - Date.now());
};