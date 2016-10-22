const wiki = require("wikijs");
const wikipedia = new wiki.default();

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix) => {
	if(suffix) {
		wikipedia.search(suffix).then(data => {
			if(data.results.length>0) {
				showPage(data.results[0]);
			} else {
				showNoResults(suffix);
			}
		})
	} else {
		wikipedia.random(1).then(results => {
			showPage(results[0]);
		});
	}

	function showPage(title) {
		wikipedia.page(title).then(page => {
			showSummary(page);
		});
	}

	function showSummary(page) {
		if(page.raw.pageid==null) {
			showNoResults(page.raw.title);
		} else {
			page.summary().then(summary => {
				if(page.raw.pageprops && page.raw.pageprops.disambiguation!=null) {
					var options = summary.split("\n").slice(1);
					msg.channel.createMessage("Select one of the following:\n\t" + options.map((a, i) => {
						return i + ") " + a;
					}).join("\n\t")).then(() => {
						bot.awaitMessage(msg.channel.id, msg.author.id, message => {
							message.content = message.content.trim();
							return message.content && !isNaN(message.content) && message.content>=0 && message.content<options.length;
						}, message => {
							var selection = options[+message.content.trim()];
							showPage(selection.substring(0, selection.indexOf(",")));
						});
					});
				} else {
					bot.sendArray(msg.channel, summary.split("\n").slice(0, 3).concat("**" + page.raw.fullurl + "**"));
				}
			});
		}
	}

	function showNoResults(title) {
		winston.warn("No Wikipedia results found for '" + title + "'", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
		msg.channel.createMessage("Wikipedia has nothing 📚🤓");
	}
};