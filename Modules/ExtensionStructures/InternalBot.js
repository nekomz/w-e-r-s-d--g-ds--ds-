"use strict";

// Bot object for extensions
module.exports = class Bot {
	constructor(bot, db, winston, svr, serverDocument) {
		this.user = bot.user;
		this.servers = bot.guilds.length;
		this.users = bot.users.length;
		this.uptime = process.uptime();
		this.connectionUptime = bot.uptime;

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
		this.getMemberName = (member, ignoreNick) => {
			return bot.getName(svr, serverDocument, member, ignoreNick);
		};
		this.getMemberAdminLevel = member => {
			return bot.getUserBotAdmin(svr, serverDocument, member);
		};
        this.getMemberData = (member, callback) => {
        	var memberDocument = serverDocument.members.id(member.id);
			callback(memberDocument ? memberDocument.toObject() : null);
        };
        this.setMemberDataKey = (member, key, value, callback) => {
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
	            serverDocument.save(err => {
	            	callback(err, memberDocument);
	            });
            }
        };
        this.deleteMemberDataKey = (member, key, callback) => {
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
        this.getUserData = (member, callback) => {
        	db.users.findOne({_id: member.id}, (err, userDocument) => {
        		callback(userDocument ? userDocument.toObject() : null);
        	});
        };
        this.setUserData = (member, key, value, callback) => {
        	if(!member.user.bot) {
	        	db.users.findOrCreate({_id: member.id}, (err, userDocument) => {
	        		if(!err && userDocument) {
		        		if(!userDocument.profile_fields) {
							userDocument.profile_fields = {};
						}
	        			userDocument.profile_fields[key] = value;
	        			userDocument.save(err => {
	    					callback(err, userDocument);
	        			});
	        		} else {
	        			callback(err);
	        		}
	        	});
        	}
        };
        this.deleteUserData = (member, key, callback) => {
        	if(!member.user.bot) {
	        	db.users.findOrCreate({_id: member.id}, (err, userDocument) => {
	        		if(!err && userDocument) {
		        		if(!userDocument.profile_fields) {
							userDocument.profile_fields = {};
						}
	        			delete userDocument.profile_fields[key];
	        			userDocument.save(err => {
	    					callback(err, userDocument);
	        			});
	        		} else {
	        			callback(err);
	        		}
	        	});
	        }
    	};
    	this.handleViolation = (ch, member, userMessage, adminMessage, strikeMessage, action, roleid) => {
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