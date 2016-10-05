const os = require("os");

// Shows bot debug info
module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
	msg.channel.createMessage("```xl\nSystem info: " + process.platform + "-" + process.arch + " with " + process.release.name + " version " + process.version.slice(1) + "\nProcess info: PID " + process.pid + " at " + process.cwd() + "\nProcess memory usage: " + Math.ceil(process.memoryUsage().heapTotal / 1000000) + " MB\nSystem memory usage: " + Math.ceil((os.totalmem() - os.freemem()) / 1000000) + " of " + Math.ceil(os.totalmem() / 1000000) + " MB\nBot info: ID " + bot.user.id + " #" + bot.user.discriminator + "\n```");
};