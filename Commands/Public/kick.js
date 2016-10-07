module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix, commandData) => {
    var member = bot.memberSearch(suffix, msg.guild);
    if(!suffix || !member || [msg.author.id, bot.user.id].indexOf(member.id)>-1) {
        winston.warn("Invalid member provided for " + commandData.name + " command", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
        msg.channel.createMessage(msg.author.mention + " Do you want me to kick you? 😮");
    } else {
        member.kick().then(() => {
            msg.channel.createMessage("Ok, user kicked 👋");
        }).catch(err => {
            winston.error("Failed to kick member '" + member.user.username + "' from server '" + msg.guild.name + "'", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id}, err);
            msg.channel.createMessage("I don't have permission to kick on this server 😭");
        });
    }
}