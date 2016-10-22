module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix, commandData) => {
    this.enablePublicCommand = (command) => {
        command = command || "";
        command = command.trim().toLowerCase();

        if (!command.length) {
            return false;
        }

        if (!serverDocument.config.commands.hasOwnProperty(command)) {
            return false;
        }

        serverDocument.config.commands[command].isEnabled = true;
        let index = serverDocument.config.commands[command].disabled_channel_ids.indexOf(msg.channel.id);
        if (~index) {
            serverDocument.config.commands[command].disabled_channel_ids.splice(index, 1);
        }

        return true;
    };

    this.enablePublicCommands = () => {
        // handle disabling of commands
        let enables = [];
        let errors = [];

        let params = suffix.split(" ");
        params.forEach((param, index, array) => {
            if (this.enablePublicCommand(param)) {
                enables.push(param);
            }
            else {
                errors.push(param);
            }
        });

        // nothing happened?
        if (!enables.length && !errors.length) {
            winston.warn("No parameters provided for " + commandData.name + " command", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
            msg.channel.createMessage(msg.author.mention + " Missing command arguments to enable.");
            return;
        }

        let output = [];
        if (enables.length) {
            output.push("The following commands have been enabled in this channel: ✨```" + enables.join(", ") + "```");
        }
        if (errors.length) {
            output.push("Unable to enable the following commands in this channel: 😿```" + errors.join(". ") + "```");
        }

        msg.channel.createMessage(output.join("\n"));
    };

    this.listEnabledCommands = () => {
        let command_keys = Object.keys(serverDocument.config.commands.toJSON());
        let enabled = [];

        command_keys.forEach((command_key, index, array) => {
            if (!~serverDocument.config.commands[command_key].disabled_channel_ids.indexOf(msg.channel.id)) {
                enabled.push(command_key);
            }
        });

        if (enabled.length) {
            msg.channel.createMessage("The following commands are enabled in this channel: ✨```" + enabled.join(", ") + "```");
            return;
        }

        msg.channel.createMessage("There are no commands enabled in this channel. 💔");
    };

    // handle command opts
    switch (suffix.toLowerCase()) {
        case "":
            this.listEnabledCommands();
            return;
        default:
            this.enablePublicCommands();
    }
};
