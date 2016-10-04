const mongoose = require("mongoose");
require("mongoose-function")(mongoose);
const findOrCreate = require("mongoose-findorcreate");
const serverSchema = require("./Schemas/serverSchema.js");
const userSchema = require("./Schemas/userSchema.js");
userSchema.plugin(findOrCreate);
const modulesSchema = require("./Schemas/modulesSchema.js");

var db;
var connection;

// Connect to and setup database
module.exports = {
	initialize: (url, callback) => {
		connection = mongoose.createConnection(url);
		connection.on("error", callback);
		connection.once("open", () => {
			if(!connection.models.servers) {
				connection.model("servers", serverSchema);
			}
			if(!connection.models.users) {
				connection.model("users", userSchema);
			}
			if(!connection.models.gallery) {
				connection.model("gallery", modulesSchema);
			}
			db = connection.models;
			callback();
		});
	},
	get: () => {
		return db;
	},
	getConnection: () => {
		return connection;
	}
};
