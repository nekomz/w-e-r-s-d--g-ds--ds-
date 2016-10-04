const secondsToString = require("./../Modules/PrettySeconds.js");
const util = require("util");

// Run eval on maintainer message
module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
	if(config.maintainers.indexOf(msg.author.id)>-1) {
		if(suffix) {
            try {
                var result = eval(suffix);
                if(typeof(result)=="object") {
                    result = util.inspect(result);
                }
                msg.channel.createMessage("```" + result + "```");
            } catch(err) {
                msg.channel.createMessage("```" + err + "```");
            }
        }
    } else {
        msg.channel.createMessage(msg.author.mention + " Who do you think you are?! LOL");
    }
};