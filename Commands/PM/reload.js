const commands = require("./../../Configuration/commands.json");

module.exports = (bot, db, config, winston, userDocument, msg) => {
	// maintainers only
	if (!~config.maintainers.indexOf(msg.author.id)) {
		return;
	}

	let params = msg.content.split(/\s+/);
	params.shift();

	if (!params.length) {
		msg.channel.createMessage("No commands to reload.");
		return;
	}

	params.forEach((command, index, array) => {
		let command_args = command.split("/");

		// assume public command by default
		let type = "public";
		let command_hook = command_args[0].toLowerCase();

		if (command_args.length > 1) {
			type = command_hook;
			command_hook = command_args[1].toLowerCase();
		}

		// check if command exists
		if (commands.hasOwnProperty(type)) {
			// wildcard reload?
			if (command_hook == "*") {
				switch (type) {
					case "pm":
						bot.reloadAllPrivateCommands();
						break;
					case "public":
						bot.reloadAllPublicCommands();
						break;
				}

				winston.info("Reloaded all " + type + " commands", { usrid: msg.author.id });
				msg.channel.createMessage("Reloaded all " + type + " commands");
				return;
			}

			if (commands[type].hasOwnProperty(command_hook)) {
				switch (type) {
					case "pm":
						bot.reloadPrivateCommand(command_hook);
						break;
					case "public":
						bot.reloadPublicCommand(command_hook);
						break;
					default:
						msg.channel.createMessage("Unable to find command `" + command_hook + "` of type `" + type + "`.");
						return;
				}
			}

			winston.info("Reloaded " + type + " command `" + command_hook + "`", { usrid: msg.author.id });
			msg.channel.createMessage("Reloaded " + type + " command `" + command_hook + "`");
		}
		else {
			winston.error("Invalid command type or command not in commands.json - `" + command_hook + "`", { usrid: msg.author.id });
			msg.channel.createMessage("Invalid command type or command not in commands.json - `" + command_hook + "`");
		}
	});
};
