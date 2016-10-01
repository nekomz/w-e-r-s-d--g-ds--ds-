const secondsToString = require("./../Modules/PrettySeconds.js");

// Run eval on maintainer message
module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
	if(config.maintainers.indexOf(msg.author.id)>-1) {
		if(suffix) {
            try {
                msg.channel.createMessage("```" + eval(suffix) + "```");
            } catch(err) {
                msg.channel.createMessage("```" + err + "```");
            }
        }
    } else {
        msg.channel.createMessage(msg.author.mention + " Who do you think you are?! LOL");
    }
};