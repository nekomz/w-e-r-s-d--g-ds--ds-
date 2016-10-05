const itunes = require("searchitunes");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
    var apps = getAppList(suffix);
    if(apps.length>0) {
        var results = [];
        function fetchApp(i, callback) {
            if(i>=apps.length) {
                callback();
            } else {
                apps[i] = apps[i].trim();
                itunes({
                    entity: "software",
                    country: "US",
                    term: apps[i],
                    limit: 1
                }, (err, data) => {
                    if(err) {
                        winston.warn("Apple app '" + apps[i] + "' not found to link", {svrid: msg.channel.guild.id, chid: msg.channel.id, usrid: msg.author.id})
                        results.push("❌ No results found for `" + apps[i] + "`");
                    } else {
                        results.push("**" + data.results[0].trackCensoredName + "** by " + data.results[0].artistName + ", " + data.results[0].formattedPrice + " and rated " + data.results[0].averageUserRating + " stars: " + data.results[0].trackViewUrl + "\n");
                    }
                    fetchApp(++i, callback);
                });
            }
        }
        fetchApp(0, () => {
            bot.sendArray(msg.channel, results);
        });
    } else {
        msg.channel.createMessage("http://www.apple.com/itunes/charts/free-apps/");
    }
}

function getAppList(suffix) {
    var apps = suffix.split(",");
    var i = 0;
    while(i<apps.length) {
        if(!apps[i] || apps.indexOf(apps[i])!=i) {
            apps.splice(i, 1);
        } else {
            i++;
        }
    }
    return apps;
}
