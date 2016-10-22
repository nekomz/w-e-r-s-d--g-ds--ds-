const mongoose = require("mongoose");
const findOrCreate = require("mongoose-findorcreate");
const serverSchema = require("./Schemas/serverSchema.js");
const userSchema = require("./Schemas/userSchema.js");
userSchema.plugin(findOrCreate);
const modulesSchema = require("./Schemas/modulesSchema.js");
modulesSchema.index({
	name: "text",
	description: "text"
});


// Connect to and setup database
module.exports = {
	initialize: (url, callback) => {
		mongoose.connect(url, {
			autoReconnect: true,
			connectTimeoutMS: 30000,
			socketTimeoutMS: 30000,
			keepAlive: 120,
			poolSize: 100
		});

		mongoose.model("servers", serverSchema);
		mongoose.model("users", userSchema);
		mongoose.model("gallery", modulesSchema);

		mongoose.connection.on("error", callback);
		mongoose.connection.once("open", callback);
	},
	get: () => {
		return mongoose.models;
	},
	getConnection: () => {
		return mongoose.connection;
	}
};
