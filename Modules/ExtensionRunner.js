const getSandbox = require("./ExtensionStructures/Sandbox.js");

const domain = require("domain");
const fs = require("fs");
const {VM} = require("vm2");

// Run an extension (command, keyword, or timer)
module.exports = (bot, db, winston, svr, ch, extensionDocument, msg, suffix, keywordMatch) => {
	var extensionSandbox = getSandbox(bot, db, winston, extensionDocument, svr, serverDocument, ch, msg, suffix, keywordMatch);
	var extensionVM = new VM({
		timeout: 10000,
		sandbox: extensionSandbox
	});
	fs.readFile(__dirname + "/../Extensions/" + svr.id + "-" + extensionDocument._id + ".abext", "utf8", (err, extensionCode) => {
		if(err) {
			winston.error("Failed to run " + extensionDocument.type + " extension '" + extensionDocument.name + "'", {svrid: svr.id, chid: ch.id, extid: extensionDocument._id}, err);
		} else {
			// Run extension in vm2 sandbox
			try {
			    var extensionDomain = domain.create();
			    extensionDomain.run(() => {
					extensionVM.run(extensionCode);
			    });
			    extensionDomain.on("error", err => {
			        winston.error("Failed to run " + extensionDocument.type + " extension '" + extensionDocument.name + "'", {svrid: svr.id, chid: ch.id, extid: extensionDocument._id}, err);
			    });
		    } catch(err) {
		    	winston.error("Failed to run " + extensionDocument.type + " extension '" + extensionDocument.name + "'", {svrid: svr.id, chid: ch.id, extid: extensionDocument._id}, err);
		    }
		}
	});
};