const urban = require("urban");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix, commandData) => {
	if(suffix) {
		urban(suffix).first(showWord);
	} else {
		urban.random().first(showWord);
	}

	function showWord(data) {
		if(data) {
			msg.channel.createMessage("📖 **" + data.word + "** by " + data.author + "\t" + data.thumbs_up + " 👍\t<" + data.permalink + ">```" + data.definition + "```");
		} else {
			showNoResult();
		}
	}

	function showNoResult() {
		msg.channel.createMessage("Wtf?! Urban Dicitonary doesn't have anything to say 🚨");
	}
};