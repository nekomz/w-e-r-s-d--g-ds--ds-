const mongoose = require("mongoose");

// User data (past names, profile fields, etc...)
module.exports = new mongoose.Schema({
    _id: String,
    past_names: [String],
    points: {type: Number, default: 0, min: 0},
    afk_message: String,
    server_nicks: [new mongoose.Schema({
        _id: String,
        server_id: String
    })],
	reminders: [new mongoose.Schema({
        name: {type: String, required: true},
        expiry_timestamp: {type: Date, required: true}
    })],
    location: String,
	last_seen: Date,
	profile_fields: mongoose.Schema.Types.Mixed,
    profile_background_image: {type: String, default: "http://i.imgur.com/8UIlbtg.jpg"},
	isProfilePublic: {type: Boolean, default: true},
    upvoted_gallery_extensions: [String]
});