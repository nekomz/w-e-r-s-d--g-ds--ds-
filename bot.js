// Import and setup files and modules
var eventHandlers = {
	ready: require("./Events/ready.js"),
	shardReady: require("./Events/shardReady.js"),
	guildCreate: require("./Events/guildCreate.js"),
	guildUpdate: require("./Events/guildUpdate.js"),
	guildDelete: require("./Events/guildDelete.js"),
	channelDelete: require("./Events/channelDelete.js"),
	guildRoleDelete: require("./Events/guildRoleDelete.js"),
	guildMemberAdd: require("./Events/guildMemberAdd.js"),
	guildMemberUpdate: require("./Events/guildMemberUpdate.js"),
	guildMemberRemove: require("./Events/guildMemberRemove.js"),
	guildBanAdd: require("./Events/guildBanAdd.js"),
	guildBanRemove: require("./Events/guildBanRemove.js"),
	message: require("./Events/messageCreate.js"),
	messageUpdate: require("./Events/messageUpdate.js"),
	messageDelete: require("./Events/messageDelete.js"),
	presenceUpdate: require("./Events/presenceUpdate.js"),
	userUpdate: require("./Events/userUpdate.js"),
	voiceChannelJoin: require("./Events/voiceChannelJoin.js"),
	voiceStateUpdate: require("./Events/voiceStateUpdate.js"),
	voiceChannelLeave: require("./Events/voiceChannelLeave.js")
};
const database = require("./Database/Driver.js");

const auth = require("./Configuration/auth.json");
var config = require("./Configuration/config.json");
const winston = require("winston");
const domain = require("domain");

// Set up default winston logger
winston.add(winston.transports.File, {
	filename: "bot-out.log"
});

// Connect to and initialize database
var db;
database.initialize(config.db_url, err => {
	if(err) {
		winston.error("Failed to connect to database");
		process.exit(1);
	} else {
		db = database.get();

		// Get bot client from platform and login
		var bot = require("./Platform/Platform.js")(db, auth, config);
		bot.connect().then(() => {
			winston.info("Started bot application");
		});

		// After guilds and users have been created (first-time only)
		bot.once("ready", () => {
			eventHandlers.ready(bot, db, config, winston);
		});

		// A shard receives the ready packet
		bot.on("shardReady", id => {
			eventHandlers.shardReady(bot, db, config, winston, id);
		});

		// Server joined by bot
		bot.on("guildCreate", svr => {
			const guildCreateDomain = domain.create();
			guildCreateDomain.run(() => {
				eventHandlers.guildCreate(bot, db, config, winston, svr);
			});
			guildCreateDomain.on("error", err => {
				winston.error(err);
			});
		});

		// Server details updated (name, icon, etc.)
		bot.on("guildUpdate", (svr, oldsvrdata) => {
			const guildUpdateDomain = domain.create();
			guildUpdateDomain.run(() => {
				eventHandlers.guildUpdate(bot, db, config, winston, svr, oldsvrdata);
			});
			guildUpdateDomain.on("error", err => {
				winston.error(err);
			});
		});

		// Server left by bot or deleted
		bot.on("guildDelete", (svr, unavailable) => {
			if(!unavailable) {
				const guildDeleteDomain = domain.create();
				guildDeleteDomain.run(() => {
					eventHandlers.guildDelete(bot, db, config, winston, svr);
				});
				guildDeleteDomain.on("error", err => {
					winston.error(err);
				});
			}
		});

		// Server channel deleted
		bot.on("channelDelete", ch => {
			const channelDeleteDomain = domain.create();
			channelDeleteDomain.run(() => {
				eventHandlers.channelDelete(bot, db, config, winston, ch);
			});
			channelDeleteDomain.on("error", err => {
				winston.error(err);
			});
		});

		// Server role deleted
		bot.on("guildRoleDelete", (svr, role) => {
			const guildRoleDeleteDomain = domain.create();
			guildRoleDeleteDomain.run(() => {
				eventHandlers.guildRoleDelete(bot, db, config, winston, svr, role);
			});
			guildRoleDeleteDomain.on("error", err => {
				winston.error(err);
			});
		});

		// User joined server
		bot.on("guildMemberAdd", (svr, member) => {
			const guildMemberAddDomain = domain.create();
			guildMemberAddDomain.run(() => {
				eventHandlers.guildMemberAdd(bot, db, config, winston, svr, member);
			});
			guildMemberAddDomain.on("error", err => {
				winston.error(err);
			})
		});

		// User details updated on server (role, nickname, etc.)
		bot.on("guildMemberUpdate", (svr, member, oldmemberdata) => {
			const guildMemberUpdateDomain = domain.create();
			guildMemberUpdateDomain.run(() => {
					eventHandlers.guildMemberUpdate(bot, db, config, winston, svr, member, oldmemberdata);
			});
			guildMemberUpdateDomain.on("error", err => {
				winston.error(err);
			})
		});

		// User left or kicked from server
		bot.on("guildMemberRemove", (svr, member) => {
			const guildMemberRemoveDomain = domain.create();
			guildMemberRemoveDomain.run(() => {
				eventHandlers.guildMemberRemove(bot, db, config, winston, svr, member);
			});
			guildMemberRemoveDomain.on("error", err => {
				winston.error(err);
			});
		});

		// User banned from server
		bot.on("guildBanAdd", (svr, usr) => {
			const guildBanAddDomain = domain.create();
			guildBanAddDomain.run(() => {
				eventHandlers.guildBanAdd(bot, db, config, winston, svr, usr);
			});
			guildBanAddDomain.on("error", err => {
				winston.error(err);
			});
		})

		// User unbanned from server
		bot.on("guildBanRemove", (svr, usr) => {
			const guildBanRemoveDomain = domain.create();
			guildBanRemoveDomain.run(() => {
				eventHandlers.guildBanRemove(bot, db, config, winston, svr, usr);
			});
			guildBanRemoveDomain.on("error", err => {
				winston.error(err);
			});
		});

		// Message sent on server
		bot.on("messageCreate", msg => {
			const messageDomain = domain.create();
			messageDomain.run(() => {
				eventHandlers.message(bot, db, config, winston, msg);
			});
			messageDomain.on("error", err => {
				winston.error(err);
			});
		});

		// Message updated (edited, functionpinned, etc.)
		bot.on("messageUpdate", (msg, oldmsgdata) => {
			const messageUpdateDomain = domain.create();
			messageUpdateDomain.run(() => {
				eventHandlers.messageUpdate(bot, db, config, winston, msg, oldmsgdata);
			});
			messageUpdateDomain.on("error", err => {
				winston.error(err);
			});
		});

		// Message deleted
		bot.on("messageDelete", msg => {
			const messageDeleteDomain = domain.create();
			messageDeleteDomain.run(() => {
				eventHandlers.messageDelete(bot, db, config, winston, msg);
			});
			messageDeleteDomain.on("error", err => {
				winston.error(err);
			});
		});

		// User status changed (afk, new game, etc.)
		bot.on("presenceUpdate", (mmeber, oldpresence) => {
			const presenceUpdateDomain = domain.create();
			presenceUpdateDomain.run(() => {
				eventHandlers.presenceUpdate(bot, db, config, winston, usr, oldpresence);
			});
			presenceUpdateDomain.on("error", err => {
				winston.error(err);
			});
		});

		// User updated (name, avatar, etc.)
		bot.on("userUpdate", (usr, oldusrdata) => {
			const userUpdateDomain = domain.create();
			userUpdateDomain.run(() => {
				eventHandlers.userUpdate(bot, db, config, winston, usr, oldusrdata);
			});
			userUpdateDomain.on("error", err => {
				winston.error(err);
			});
		});

		// User joined server voice channel
		bot.on("voiceChannelJoin", (member, ch) => {
			const voiceChannelJoinDomain = domain.create();
			voiceChannelJoinDomain.run(() => {
				eventHandlers.voiceChannelJoin(bot, db, config, winston, member, ch);
			});
			voiceChannelJoinDomain.on("error", err => {
				winston.error(err);
			});
		});

		// User voice connection details updated on server (muted, deafened, etc.)
		bot.on("voiceStateUpdate", (member, oldvoice) => {
			const voiceStateUpdateDomain = domain.create();
			voiceStateUpdateDomain.run(() => {
				eventHandlers.voiceStateUpdate(bot, db, config, winston, member, oldvoice);
			});
			voiceStateUpdateDomain.on("error", err => {
				winston.error(err);
			});
		});

		// User left server voice channel
		bot.on("voiceChannelLeave", (member, ch) => {
			const voiceChannelJoinDomain = domain.create();
			voiceChannelJoinDomain.run(() => {
				eventHandlers.voiceChannelJoin(bot, db, config, winston, member, ch);
			});
			voiceChannelJoinDomain.on("error", err => {
				winston.error(err);
			});
		});
	}
});