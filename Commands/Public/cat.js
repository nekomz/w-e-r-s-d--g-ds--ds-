const unirest = require("unirest");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg) => {
	unirest.get("http://random.cat/meow").end(res => {
		var image = "http://i.imgur.com/Bai6JTL.jpg";
		if(res.status==200) {
			image = res.body.file;
		}
		msg.channel.createMessage(image);
	});
}
