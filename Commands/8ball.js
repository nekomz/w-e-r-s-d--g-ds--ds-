const unirest = require("unirest");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
    if(suffix) {
        unirest.get("https://8ball.delegator.com/magic/JSON/" + encodeURI(suffix.replaceAll("&", ""))).header("Accept", "application/json").end(res => {
            if(res.status==200) {
                msg.channel.createMessage("```" + res.body.magic.answer + "```");
            } else {
                winston.error("Failed to fetch 8ball answer", {svrid: msg.channel.guild.id, chid: msg.channel.id});
                msg.channel.createMessage("Broken 8ball :8ball: :confused:");
            }
        });
    } else {
        winston.warn("No parameters provided for 8ball command", {svrid: msg.channel.guild.id, chid: msg.channel.id});
        msg.channel.createMessage(msg.author.mention + " You tell me... :stuck_out_tongue_winking_eye:");
    }
}