const unirest = require("unirest");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
    if(suffix) {
        var query = suffix.substring(0, suffix.lastIndexOf(" "));
        var num = suffix.substring(suffix.lastIndexOf(" ")+1);

        if(!query || isNaN(num)) {
            query = suffix;
            num = serverDocument.config.command_fetch_properties.default_count;
        }
        if(num<1 || num>serverDocument.config.command_fetch_properties.max_count) {
            num = serverDocument.config.command_fetch_properties.default_count;
        } else {
            num = parseInt(num);
        }

        unirest.get("http://hummingbird.me/api/v1/search/anime?query=" + query.replaceAll("&", "")).header("Accept", "application/json").end(res => {
            if(res.status==200 && res.body.length>0) {
                var results = [];
                for(var i=0; i<num; i++) {
                    if(i>=res.body.length) {
                        break;
                    }
                    var info = "__**" + res.body[i].title + "**__```" + res.body[i].synopsis + "```**Status:** " + res.body[i].status + "\n**Episodes:** " + res.body[i].episode_num + "\n**Length:** " + res.body[i].episode_length + " minutes" + (res.body[i].age_rating ? ("\n**Age Rating:** " + res.body[i].age_rating) : "") + "\n**Type:** " + res.body[i].show_type + "\n**Rating:** " + (Math.round(res.body[i].community_rating * 10)/10) + "\n**Genres:**";
                    for(var j=0; j<res.body[i].genres.length; j++) {
                        info += "\n\t" + res.body[i].genres[j].name;
                    }
                    info += (res.body[i].started_airing ? ("\n**Started Airing:** " + res.body[i].started_airing) : "") + (res.body[i].finished_airing ? ("\n**Finished Airing:** " + res.body[i].finished_airing) : "") + "\n" + res.body[i].url;
                    results.push(info);
                }
                if(results.length>1) {
                    var info = "Select one of the following:\n";
                    for(var i=0; i<results.length; i++) {
                        info += "\t" + i + ") " + results[i].substring(4, results[i].indexOf("**", 5)) + "\n";
                    }
                    msg.channel.createMessage(info);
                    bot.awaitMessage(msg.channel.id, msg.author.id, message => {
                        message.content = message.content.trim();
                        return message.content && !isNaN(message.content) && message.content>=0 && message.content<results.length;
                    }, message => {
                        msg.channel.createMessage(results[parseInt(message.content)]);
                    });
                } else {
                    bot.createMessage(results[0]);
                }
            } else {
                winston.warn("No anime found for '" + query + "'", {svrid: msg.channel.guild.id, chid: msg.channel.id, usrid: msg.author.id});
                msg.channel.createMessage("No anime found (˃̥̥ω˂̥̥̥)");
            }
        });
    } else {
        winston.warn("Anime query not provided", {svrid: msg.channel.guild.id, chid: msg.channel.id, usrid: msg.author.id});
        msg.channel.createMessage(msg.author.mention + " You gotta give me somethin' to search for!")
    }
};
