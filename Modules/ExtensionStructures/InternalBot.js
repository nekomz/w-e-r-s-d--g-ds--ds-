"use strict";

// Bot object for extensions
module.exports = class Bot {
	constructor(bot, db, winston, svr, serverDocument) {
		this.user = bot.user;
		this.guilds = bot.guilds.length;
		this.users = bot.users.length;
		this.uptime = process.uptime();
		this.connectionUptime = bot.uptime;

		this.awaitMessage = (chid, usrid, filter, callback) => {
			if(svr.channels.get(chid) && svr.members.get(usrid)) {
				bot.awaitMessage(chid, usrid, filter, callback);
			}
		};
		this.sendArray = bot.sendArray;
		this.messageBotAdmins = message => {
			bot.messageBotAdmins(svr, serverDocument, message);
		};
		this.isMuted = bot.isMuted;
		this.muteMember = bot.muteMember;
		this.unmuteMember = bot.unmuteMember;
		this.getMember = str => {
			return bot.memberSearch(str, svr);
		};
		this.getMemberName = (usrid, ignoreNick) => {
			var member = svr.members.get(usrid);
			if(!member) {
				return;
			}
			return bot.getName(svr, serverDocument, member, ignoreNick);
		};
		this.getMemberAdminLevel = usrid => {
			var member = svr.members.get(usrid);
			if(!member) {
				return;
			}
			return bot.getUserBotAdmin(svr, serverDocument, member);
		};
        this.getMemberData = (usrid, callback) => {
        	var member = svr.members.get(usrid);
			if(!member) {
				callback(new Error("Invalid member ID"));
			}
        	var memberDocument = serverDocument.members.id(member.id);
			callback(memberDocument ? memberDocument.toObject() : null);
        };
        this.addMemberStrike = (usrid, reason, callback) => {
        	var member = svr.members.get(usrid);
			if(!member) {
				callback(new Error("Invalid member ID"));
				return;
			}
        	if(!member.user.bot) {
	        	var memberDocument = serverDocument.members.id(member.id);
	        	if(!memberDocument) {
					serverDocument.members.push({_id: member.id});
					memberDocument = serverDocument.members.id(member.id);
				}
	            memberDocument.strikes.push({
	            	_id: bot.user.id,
	            	reason: reason
	            });
	            serverDocument.save(err => {
	            	callback(err, memberDocument);
	            });
            }
        };
        this.setMemberDataKey = (usrid, key, value, callback) => {
        	var member = svr.members.get(usrid);
			if(!member) {
				callback(new Error("Invalid member ID"));
				return;
			}
        	if(!member.user.bot) {
	        	var memberDocument = serverDocument.members.id(member.id);
	        	if(!memberDocument) {
					serverDocument.members.push({_id: member.id});
					memberDocument = serverDocument.members.id(member.id);
				}
				if(!memberDocument.profile_fields) {
					memberDocument.profile_fields = {};
				}
	            memberDocument.profile_fields[key] = value;
	            serverDocument.markModified("members");
	            serverDocument.save(err => {
	            	callback(err, memberDocument);
	            });
            }
        };
        this.deleteMemberDataKey = (usrid, key, callback) => {
        	var member = svr.members.get(usrid);
			if(!member) {
				callback(new Error("Invalid member ID"));
				return;
			}
        	if(!member.user.bot) {
	        	var memberDocument = serverDocument.members.id(member.id);
	        	if(!memberDocument) {
					serverDocument.members.push({_id: member.id});
					memberDocument = serverDocument.members.id(member.id);
				}
				if(!memberDocument.profile_fields) {
					memberDocument.profile_fields = {};
				}
	            delete memberDocument.profile_fields[key];
	            serverDocument.save(err => {
	            	callback(err, memberDocument);
	            });
            }
        };
        this.getUserData = (usrid, callback) => {
        	var member = svr.members.get(usrid);
			if(!member) {
				callback(null);
				return;
			}
        	db.users.findOne({_id: member.id}, (err, userDocument) => {
        		callback(userDocument ? userDocument.toObject() : null);
        	});
        };
    	this.handleViolation = (chid, memberid, userMessage, adminMessage, strikeMessage, action, roleid) => {
    		var ch = svr.channels.get(chid);
    		var member = svr.members.get(usrid);
			if(!ch || !member) {
				return;
			}
    		if(!member.user.bot) {
    			db.users.findOrCreate({_id: member.id}, (err, userDocument) => {
        			if(!err && userDocument) {
		    			var memberDocument = serverDocument.members.id(member.id);
			        	if(!memberDocument) {
							serverDocument.members.push({_id: member.id});
							memberDocument = serverDocument.members.id(member.id);
						}
			            serverDocument.save(err => {
			            	bot.handleViolation(winston, svr, serverDocument, ch, member, userDocument, memberDocument, userMessage, adminMessage, strikeMessage, action, roleid);
		            	});
	            	}
            	});
    		}
    	};
	}
}
