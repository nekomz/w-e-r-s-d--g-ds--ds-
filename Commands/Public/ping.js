const secondsToString = require("./../../Modules/PrettySeconds.js");

// Check if the bot is alive and well
module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg) => {
	var info = "🏓 **" + (msg.channel.guild.members.get(bot.user.id).nick || bot.user.username) + "** v" + config.version + " by @BitQuote running for " + secondsToString(process.uptime()).slice(0, -1) + ". Serving " + bot.users.size + " user" + (bot.users.size==1 ? "" : "s") + " in " + bot.guilds.size + " server" + (bot.guilds.size==1 ? "" : "s");
    if(config.hosting_url) {
        info += ". Info: " + config.hosting_url;
    }
    msg.channel.createMessage(info);
};
