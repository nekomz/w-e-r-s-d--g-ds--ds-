const mongoose = require("mongoose");

// Schema for a server
module.exports = new mongoose.Schema({
	_id: {type: String, required: true},
	config: require("./serverConfigSchema.js"),
	extensions: [require("./modulesSchema.js")],
	members: [require("./serverMembersSchema.js")],
	games: [require("./serverGamesSchema.js")],
	channels: [require("./serverChannelsSchema.js")],
	command_usage: mongoose.Schema.Types.Mixed,
	messages_today: {type: Number, default: 0},
	stats_timestamp: {type: Date, default: Date.now},
	voice_data: [new mongoose.Schema({
		_id: {type: String, required: true},
		started_timestamp: {type: Date, required: true}
	})],
	member_kicked_data: [new mongoose.Schema({
		_id: {type: String, required: true},
		creator_id: {type: String, required: true},
		reason: {type: String, required: true}
	})],
	member_banned_data: [new mongoose.Schema({
		_id: {type: String, required: true},
		creator_id: {type: String, required: true},
		reason: {type: String, required: true}
	})]
});