// Set a reminder for a user
module.exports = (bot, winston, usrid, reminder) => {
	setTimeout(() => {
		var usr = bot.users.get(usrid);
		if(usr) {
			usr.getDMChannel().then(ch => {
				ch.createMessage("**Reminder:** " + reminder.name);
			});
			reminder.remove().exec();
			winston.info("Reminded user of '" + reminder.name, {usrid: usrid});
		}
	}, reminder.expiry_timestamp - Date.now());
};