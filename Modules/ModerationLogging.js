// Manages server modlog entries
module.exports = {
	create: (svr, serverDocument, type, member, creator, reason, callback) => {
		if(serverDocument.modlog.isEnabled && serverDocument.modlog.channel_id) {
			var ch = svr.channels.get(serverDocument.modlog.channel_id);
			if(ch && ch.type==0) {
				var affected_user_str;
				if(member) {
					affected_user_str = getUserText(member.user);
				}
				var creator_str;
				if(creator) {
					creator_str = getUserText(creator.user);
				}
				ch.createMessage({
					content: getEntryText(++serverDocument.modlog.current_id, type, affected_user_str, creator_str, reason),
					disableEveryone: true
				}).then(message => {
					serverDocument.modlog.entries.push({
						_id: serverDocument.modlog.current_id,
						type: type,
						affected_user: affected_user_str,
						creator: creator_str,
						message_id: message.id,
						reason: reason
					});
					serverDocument.save(err => {
						if(callback) {
							callback(err, serverDocument.modlog.current_id);
						}
					});
				}).catch(callback);
			} else {
				if(callback) {
					callback(new Error("Invalid modlog channel"));
				}
			}
		} else {
			if(callback) {
				callback(new Error("Modlog is not enabled"));
			}
		}
	},
	update: (svr, serverDocument, id, data, callback) => {
		if(serverDocument.modlog.isEnabled && serverDocument.modlog.channel_id) {
			var modlogEntryDocument = serverDocument.modlog.entries.id(id);
			if(modlogEntryDocument) {
				if(data.creator!=null) {
					modlogEntryDocument.creator = getUserText(data.creator.user);
				}
				if(data.reason!=null) {
					modlogEntryDocument.reason = data.reason;
				}

				var ch = svr.channels.get(serverDocument.modlog.channel_id);
				if(ch && ch.type==0) {
					ch.getMessage(modlogEntryDocument.message_id).then(message => {
						message.edit(getEntryText(modlogEntryDocument._id, modlogEntryDocument.type, modlogEntryDocument.affected_user, modlogEntryDocument.creator, modlogEntryDocument.reason), true).then(() => {
							serverDocument.save(err => {
								if(callback) {
									callback(err);
								}
							});
						}).catch(callback);
					}).catch(callback);
				} else {
					if(callback) {
						callback(new Error("Invalid modlog channel"));
					}
				}
			} else {
				if(callback) {
					callback(new Error("Modlog entry with case ID " + id + " not found"));
				}
			}
		} else {
			if(callback) {
				callback(new Error("Modlog is not enabled"));
			}
		}
	},
	delete: (svr, serverDocument, id, callback) => {
		if(serverDocument.modlog.isEnabled && serverDocument.modlog.channel_id) {
			var modlogEntryDocument = serverDocument.modlog.entries.id(id);
			if(modlogEntryDocument) {
				var ch = svr.channels.get(serverDocument.modlog.channel_id);
				if(ch && ch.type==0) {
					ch.getMessage(modlogEntryDocument.message_id).then(message => {
						message.delete().then(() => {
							modlogEntryDocument.remove();
							serverDocument.save(err => {
								if(callback) {
									callback(err);
								}
							});
						}).catch(callback);
					}).catch(callback);
				} else {
					if(callback) {
						callback(new Error("Invalid modlog channel"));
					}
				}
			} else {
				if(callback) {
					callback(new Error("Modlog entry with case ID " + id + " not found"));
				}
			}
		} else {
			if(callback) {
				callback(new Error("Modlog is not enabled"));
			}
		}
	}
};

function getUserText(usr) {
	return usr.username + "#" + usr.discriminator + " <" + usr.id + ">";
}

function getEntryText(id, type, affected_user_str, creator_str, reason) {
	var info = ["🔨 **Case " + id + "**: " + type];
	if(affected_user_str) {
		info.push("👤 **User**: " + affected_user_str);
	}
	if(creator_str) {
		info.push("🐬 **Moderator**: " + creator_str);
	};
	if(reason) {
		info.push("❓ **Reason**: " + reason);
	}
	return info.join("\n");
}

function getModlogChannel(serverDocument) {

}