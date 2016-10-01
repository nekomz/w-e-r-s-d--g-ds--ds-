// Information about AwesomeBot
module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
    if(suffix && ["bug", "suggestion", "feature", "issue"].indexOf(suffix.toLowerCase())>-1) {
        msg.channel.createMessage("Please file your " + suffix.toLowerCase() + " here: https://github.com/BitQuote/AwesomeBot/issues/new");
    } else {
        msg.channel.createMessage("Hello! I'm AwesomeBot, the best discord bot! Use `" + bot.getCommandPrefix(msg.channel.guild, serverDocument) + "help` to list commands. Created by **@BitQuote** and **@mistmurk**. Built on NodeJS with DiscordJS. Go to http://awesomebot.xyz/ to learn more, or join http://discord.awesomebot.xyz/");
    }
}
