module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
    var member;
    if(!suffix || suffix.toLowerCase()=="me") {
        member = msg.member;
    } else {
        member = bot.memberSearch(suffix, msg.channel.guild);
    }
    if(member) {
        msg.channel.createMessage(member.user.avatarURL || member.user.defaultAvatarURL);
    } else {
        winston.warn("Requested member does not exist so avatar cannot be shown", {svrid: msg.channel.guild.id, chid: msg.channel.id, usrid: msg.author.id});
        msg.channel.createMessage("I don't know who that is, so you can look at my beautiful face instead :heartbeat:\n" + (bot.user.avatarURL || bot.user.defaultAvatarURL));
    }
}
