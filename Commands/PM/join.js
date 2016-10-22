module.exports = (bot, db, config, winston, userDocument, msg, suffix, commandData) => {
	msg.channel.createMessage(config.oauth_link + " 😊");
};