module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix, commandData) => {
	if(suffix.indexOf(" ")>-1) {
        var min = suffix.substring(0, suffix.indexOf(" "));
        var max = suffix.substring(suffix.indexOf(" ")+1);
    } else if(!suffix) {
        var min = 1;
        var max = 6;
    } else {
        var min = 0;
        var max = suffix;
    }
    var roll = getRandomInt(parseInt(min), parseInt(max));
    if(isNaN(roll)) {
        winston.warn("Invalid parameters '" + suffix + "' provided for " + commandData.name + " command", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
        msg.channel.createMessage("wut.");
    } else {
        msg.channel.createMessage(msg.author.mention + " rolled a **" + roll + "** 🎲");
    }
};

// Get a random integer in specified range, inclusive
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}