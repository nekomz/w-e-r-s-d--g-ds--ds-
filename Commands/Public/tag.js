const default_tags = require("./../../Configuration/tags.json");

module.exports = (bot, db, config, winston, userDocument, serverDocument, channelDocument, memberDocument, msg, suffix, commandData) => {
    // settings
    this.hasArgs = false;
    this.isAdmin = false;
    this.isCommand = false;
    this.isLocked = false;
    this.tag = "";
    this.value = "";

    this.clear = () => {
        // requires admin
        if (!this.isAdmin) {
            winston.warn("Issued tag clear command without admin rights", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
            return;
        }

        msg.channel.createMessage("Are you sure you want to clear all tags?");
        bot.awaitMessage(msg.channel.id, msg.author.id, message => true, message => {
            if (this.confirmAction(message)) {
                serverDocument.config.tags.list = [];
                winston.info("Cleared all tags", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
                msg.channel.createMessage("All tags cleared 🗑");
            }
        });
    };

    this.confirmAction = (message) => {
        return ~config.yes_strings.indexOf(message.content.trim().toLowerCase());
    };

    this.delete = () => {
        // requires admin if locked
        if (this.isLocked && !this.isAdmin) {
            msg.channel.createMessage(msg.author.mention + " Only an admin can delete `" + this.tag + "`. You're not an admin 😒");
            return;
        }

        let tag_data = this.get();
        if (!tag_data) {
            msg.channel.createMessage("Tag `" + this.tag + "` does not exist 😞");
            return;
        }

        tag_data.remove(err => {
            if (err) {
                winston.error("Failed to delete tag '" + this.tag + "'", {svrid: msg.guild.id, chid: msg.channel.id, usrid: msg.author.id});
            }
        });
        msg.channel.createMessage("Tag `" + this.tag + "` deleted (✖╭╮✖)");
    };

    this.execute = () => {
        if (!this.tag) {
            return;
        }

        switch (this.tag) {
            case "clear":
                this.clear();
                break;
            case "defaults":
                this.loadDefaults();
                break;
            default:
                if (this.value == "") {
                    // deleting this with empty value?
                    if (this.hasArgs) {
                        this.delete();
                    }
                    else {
                        this.show();
                    }
                }
                else {
                    this.save();
                }
        }
    };

    this.get = (tag) => {
        tag = tag || this.tag;
        return serverDocument.config.tags.list.id(tag);
    };

    this.loadDefaults = () => {
        serverDocument.config.tags.list = default_tags;
        msg.channel.createMessage("Loaded default tags 📥");
    };

    this.list = () => {
        let tags = serverDocument.config.tags.list.map(tag => {
            let content = tag.content.replace(/(https?:[^ ]+)/gi, '<$1>');
            return "**" + tag._id + "**: " + content;
        });

        if (tags.length) {
            msg.channel.createMessage(tags.join("\n"));
        }
        else {
            msg.channel.createMessage("No tags 🙅‍♂️");
        }
    };

    this.parse = () => {
        let params = suffix.split("|");

        if (params.length >= 1) {
            this.tag = params[0].trim().toLowerCase();
        }

        if (params.length >= 2) {
            this.value = params[1].trim();
        }

        if (params.length >= 3) {
            let opts = params[2].trim().toLowerCase().split(/\s*,\s*/);
            if (~opts.indexOf("command")) {
                this.isCommand = true;
            }
            if (~opts.indexOf("lock")) {
                this.isLocked = true;
            }
        }

        let admin_user = serverDocument.config.admins.id(msg.author.id);
        this.isAdmin = admin_user && admin_user.level;
        this.hasArgs = params.length > 1;

        return true;
    };

    this.save = () => {
        let tag_data = this.get();
        if (!tag_data) {
            serverDocument.config.tags.list.push({
                _id: this.tag,
                content: this.value,
                isCommand: this.isCommand,
                isLocked: this.isLocked
            });
            msg.channel.createMessage("New tag `" + this.tag + "` created 😃");
        }
        else {
            // locked and require admin?
            if (tag_data.isLocked && !this.isAdmin) {
                msg.channel.createMessage(msg.author.mention + " Are you an admin? Last time I checked, you aren't 😒");
                return;
            }

            msg.channel.createMessage("Tag `" + this.tag + "` already exists. Are you sure you want to overwrite it?");
            bot.awaitMessage(msg.channel.id, msg.author.id, message => true, message => {
                if (this.confirmAction(message)) {
                    tag_data.content = this.value;
                    tag_data.isCommand = this.isCommand;
                    tag_data.isLocked = this.isLocked;
                    msg.channel.createMessage("Tag `" + this.tag + "` updated ✏️");
                }
            });
        }
    };

    this.show = (tag) => {
        let tag_data = this.get(tag);
        if (tag_data) {
            msg.channel.createMessage(tag_data.content);
        }
        else {
            msg.channel.createMessage("Tag `" + suffix + "` does not exist. Use `" + bot.getCommandPrefix(msg.guild, serverDocument) + commandData.name + "tag " + suffix + "|<content>` + to create it.");
        }
    };

    if (!suffix) {
        this.list();
        return;
    }

    if (this.parse()) {
        this.execute();
        return;
    }

    this.show();
};
