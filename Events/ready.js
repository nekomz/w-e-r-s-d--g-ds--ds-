const auth = require("./../Configuration/auth.json");
const getNewServerData = require("./../Modules/NewServer.js");
const setReminder = require("./../Modules/SetReminder.js");
const setCountdown = require("./../Modules/SetCountdown.js");
const sendStreamingRSSUpdates = require("./../Modules/StreamingRSS.js");
const sendStreamerMessage = require("./../Modules/StreamChecker.js");
const createMessageOfTheDay = require("./../Modules/MessageOfTheDay.js");
const runExtension = require("./../Modules/ExtensionRunner.js");
const postData = require("./../Modules/PostData.js");
const startWebServer = require("./../Web/WebServer.js");

module.exports = (bot, db, config, winston) => {
	// Ensure that all servers hava database documents
	var guildIterator = bot.guilds.entries();
	function checkServerData(svr, newServerDocuments, callback) {
		db.servers.findOne({_id: svr.id}, (err, serverDocument) => {
			if(err) {
				winston.error("Failed to find server data", {svrid: svr.id}, err);
				process.exit(1);
			} else if(serverDocument) {
				var channelIDs = svr.channels.map(a => {
					return a.id;
				});
				for(var j=0; j<serverDocument.channels.length; j++) {
					if(channelIDs.indexOf(serverDocument.channels[j].id)==-1) {
						serverDocument.channels[j].remove();
					}
				}
			} else {
				newServerDocuments.push(getNewServerData(bot, svr, new db.servers({_id: svr.id})));
			}

			try {
				checkServerData(guildIterator.next().value[1], newServerDocuments, callback);
			} catch(err) {
				callback(newServerDocuments);
			}
		});
	}
	checkServerData(guildIterator.next().value[1], [], newServerDocuments => {
		if(newServerDocuments.length>0) {
			db.servers.insertMany(newServerDocuments, (err, insertedDocuments) => {
				if(err) {
					winston.error("Failed to insert new server documents", err);
					process.exit(1);
				} else {
					winston.info("Successfully inserted " + newServerDocuments.length + " new server documents into database");
					setBotGame();
				}
			});
		} else {
			setBotGame();
		}
	});

	// Set bot's "now playing" game
	function setBotGame() {
		var game = {
			name: config.game
		};
		if(config.game=="default") {
			game = {
				name: "awesomebot.xyz",
				url: "http://awesomebot.xyz"
			};
		}
		bot.editStatus(config.status, game);
		startMessageCount();
	}

	// Set messages_today to 0 for all servers
	function startMessageCount() {
		db.servers.update({}, {messages_today: 0}, {multi: true}, err => {
			if(err) {
				winston.error("Failed to start message counter");
			} else {
				function clearMessageCount() {
					db.servers.update({}, {messages_today: 0}, {multi: true}).exec();
				}
				clearMessageCount();
				setInterval(clearMessageCount, 86400000);
			}
			statsCollector();
			setReminders();
			setCountdowns();
			startStreamingRSS();
			checkStreamers();
			startMessageOfTheDay();
			runTimerExtensions();
			postData(winston, auth, bot.guilds.size, bot.user.id);
			startWebServer(bot, db, auth, config, winston);
			showStartupMessage();
		});
	}

	// Count a server's stats (games, clearing, etc.);
	function countServerStats(svr, guildIterator) {
		db.servers.findOne({_id: svr.id}, (err, serverDocument) => {
			if(!err && serverDocument) {
				// Clear stats for server if older than a week
				if((Date.now() - serverDocument.stats_timestamp)>604800000) {
					clearStats(svr, serverDocument, () => {
						// Next server
						try {
				    		countServerStats(guildIterator.next().value[1], guildIterator);
			    		} catch(err) {
			    			setTimeout(() => {
								statsCollector();
							}, 900000);
			    		}
					});
				} else {
					// Iterate through all members
					svr.members.forEach(member => {
						if(member.id!=bot.user.id && !member.user.bot) {
							// If member is playing game, add 1 (equal to five minutes) to game tally
							var game = bot.getGame(member.user);
							if(game && member.user.status=="online") {
								var gameDocument = serverDocument.games.id(game);
								if(!gameDocument) {
									serverDocument.games.push({_id: game});
									gameDocument = serverDocument.games.id(game);
								}
								gameDocument.time_played++;
							}

							// Kick member if they're inactive and autokick is on
							var memberDocument = serverDocument.members.id(member.id);
							if(memberDocument && serverDocument.config.moderation.isEnabled && serverDocument.config.moderation.autokick_members.isEnabled && (Date.now() - memberDocument.last_active)>serverDocument.config.moderation.autokick_members.max_inactivity && !memberDocument.cannotAutokick && bot.getUserBotAdmin(svr, serverDocument, member)==0) {
								member.kick().then(() => {
									winston.info("Kicked member '" + member.user.username + "' due to inactivity on server '" + svr.name + "'", {svrid: svr.id, usrid: member.id});
								}).catch(err => {
									memberDocument.cannotAutokick = true;
									winston.error("Failed to kick member '" + member.user.username + "' due to inactivity on server '" + svr.name + "'", {svrid: svr.id, usrid: member.id}, err);
								});
							}
						}
					});

					// Save changes to serverDocument
					serverDocument.save(err => {
				    	if(err) {
				    		winston.error("Failed to save server data for stats", {svrid: svr.id});
				    	}

				    	// Next server
				    	try {
				    		countServerStats(guildIterator.next().value[1], guildIterator);
			    		} catch(err) {
			    			setTimeout(() => {
								statsCollector();
							}, 900000);
			    		}
				    });
				}
			}
		});
	}
	function statsCollector() {
		var guildIterator = bot.guilds.entries();
		countServerStats(guildIterator.next().value[1], guildIterator);
	}

	// Clear stats for server if older than a week
	function clearStats(svr, serverDocument, callback) {
		if(serverDocument.config.commands.points.isEnabled && svr.members.length>2) {
			// Rank members by activity score for the week
			var topMembers = [];
	        for(var i=0; i<serverDocument.members.length; i++) {
	            var member = svr.members.get(serverDocument.members[i]._id);
	            if(member && member.id!=bot.user.id && !member.user.bot) {
	            	var activityScore = Math.ceil((serverDocument.members[i].messages + serverDocument.members[i].voice) / 10);
		            topMembers.push([member, activityScore]);
		            serverDocument.members[i].rank_score += activityScore / 10;
		            serverDocument.members[i].rank = bot.checkRank(winston, svr, serverDocument, member, serverDocument.members[i], true);
		            serverDocument.members[i].messages = 0;
		            serverDocument.members[i].voice = 0;
	            }
	        }
	        topMembers.sort((a, b) => {
	            return a[1] - b[1];
	        });

	        // Award points to top 3
	        function awardPoints(member, amount) {
	        	db.users.findOrCreate({_id: member.id}, (err, userDocument) => {
	        		if(!err && userDocument) {
		                userDocument.points += amount;
	        		} else {
	        			winston.error("Failed to create user data for '" + member.user.username + "' to award activity points on server '" + svr.name + "'", {usrid: member.id});
	        		}
	        	});

	        }
	        for(var i=topMembers.length-1; i>topMembers.length-4; i--) {
	            if(i>=0) {
	                awardPoints(topMembers[i][0], topMembers[i][1]);
	            }
	        }
	    }

	    // Reset game and message data
	    serverDocument.games = [];
	    serverDocument.commands = {};

	    // Reset stats timestamp
	    serverDocument.stats_timestamp = Date.now();

	    // Save changes to serverDocument
	    serverDocument.save(err => {
	    	if(err) {
	    		winston.error("Failed to clear stats for server '" + svr.name + "'", {svrid: svr.id});
	    	} else {
	    		winston.info("Cleared stats for server '" + svr.name + "'", {svrid: svr.id});
	    	}
	    	callback();
	    });
	}

	// Set existing reminders to send message when they expire
	function setReminders() {
		db.users.find({reminders: {$not: {$size: 0}}}, (err, userDocuments) => {
			if(err) {
				winston.error("Failed to get reminders", err);
			} else {
				for(var i=0; i<userDocuments.length; i++) {
					for(var j=0; j<userDocuments[i].reminders.length; j++) {
						setReminder(bot, winston, userDocuments[i]._id, userDocuments[i].reminders[j]);
					}
				}
			}
		});
	}

	// Set existing countdowns in servers to send message when they expire
	function setCountdowns() {
		db.servers.find({"config.countdown_data": {$not: {$size: 0}}}, (err, serverDocuments) => {
			if(err) {
				winston.error("Failed to get countdowns", err);
			} else {
				for(var i=0; i<serverDocuments.length; i++) {
					for(var j=0; j<serverDocuments[i].countdown_data.length; j++) {
						setCountdown(bot, winston, serverDocuments[i]._id, serverDocuments[i].countdown_data[j]);
					}
				}
			}
		});
	}

	// Start streaming RSS timer
	function startStreamingRSS() {
		db.servers.find({}, (err, serverDocuments) => {
			if(!err && serverDocuments) {
				function sendStreamingRSSToServer(i) {
					if(i<serverDocuments.length) {
						var serverDocument = serverDocuments[i];
						var svr = bot.guilds.get(serverDocument._id);
						if(svr) {
							function sendStreamingRSSFeed(j) {
								if(j<serverDocument.config.rss_feeds.length) {
									if(serverDocument.config.rss_feeds[j].streaming.isEnabled) {
										sendStreamingRSSUpdates(bot, winston, svr, serverDocuments[i].config.rss_feeds[j], () => {
											sendStreamingRSSFeed(++j);
										});
									}
								} else {
									sendStreamingRSSToServer(++i);
								}
							}
							sendStreamingRSSFeed(0);
						}
					} else {
						setTimeout(() => {
							sendStreamingRSSToServer(0);
						}, 600000);
					}
				}
			}
		});
	}

	// Periodically check if people are streaming
	function checkStreamers() {
		db.servers.find({}, (err, serverDocuments) => {
			if(!err && serverDocuments) {
				function checkStreamersForServer(i) {
					if(i<serverDocuments.length) {
						var serverDocument = serverDocuments[i];
						var svr = bot.guilds.get(serverDocument._id);
						if(svr) {
							function checkIfStreaming(j) {
								if(j<serverDocuments.config.streamers_data.length) {
									sendStreamerMessage(winston, svr, streamerDocument, () => {
										checkIfStreaming(++j);
									});
								} else {
									checkStreamersForServer(++i);
								}
							}
						}
					} else {
						setTimeout(() => {
							checkStreamersForServer(0);
						}, 600000);
					}
				}
			}
		});
	}

	// Start message of the day timer
	function startMessageOfTheDay() {
		db.servers.find({"config.message_of_the_day.isEnabled": true}, (err, serverDocuments) => {
			if(err) {
				winston.error("Failed to find server data for message of the day", err);
			} else {
				for(var i=0; i<serverDocuments.length; i++) {
					var svr = bot.guilds.get(serverDocuments[i]._id);
					if(svr) {
						createMessageOfTheDay(bot, winston, svr, serverDocuments[i].config.message_of_the_day);
					}
				}
			}
		});
	}

	// Start all timer extensions (third-party)
	function runTimerExtensions() {
		db.servers.find({"extensions": {$not: {$size: 0}}}, (err, serverDocuments) => {
			if(err) {
				winston.error("Failed to find server data to start timer extensions", err);
			} else {
				for(var i=0; i<serverDocuments.length; i++) {
					var svr = bot.guilds.get(serverDocuments[i]._id);
					if(svr) {
						for(var j=0; j<serverDocuments[i].extensions.length; j++) {
							if(serverDocuments[i].extensions[j].type=="timer") {
								setTimeout(() => {
									runTimerExtension(svr, serverDocuments[i].extensions[j]);
								}, (extensionDocument.last_run + extensionDocument.interval) - Date.now());
							}
						}
					}
				}
			}
		});

		function runTimerExtension(svr, extensionDocument) {
			winston.info("Running timer extension '" + extensionDocument.name + "' in server '" + svr.name + "'", {svrid: svr.id, extid: extensionDocument._id});
			for(var i=0; i<extensionDocument.enabled_channel_ids.length; i++) {
				var ch = svr.channels.get(extensionDocument.enabled_channel_ids[i]);
				if(ch) {
					runExtension(bot, db, winston, svr, ch, extensionDocument);
				}
			}
			setTimeout(() => {
				runTimerExtension(svr, extensionDocument);
			}, extensionDocument.interval);
		}
	}

	// Print startup ASCII art in console
	function showStartupMessage() {
		winston.info("Started the best Discord bot, version " + config.version + "\n\
     _                                         ____        _   \n\
    / \\__      _____  ___  ___  _ __ ___   ___| __ )  ___ | |_ \n\
   / _ \\ \\ /\\ / / _ \\/ __|/ _ \\| '_ ` _ \\ / _ \\  _ \\ / _ \\| __|\n\
  / ___ \\ V  V /  __/\\__ \\ (_) | | | | | |  __/ |_) | (_) | |_ \n\
 /_/   \\_\\_/\\_/ \\___||___/\\___/|_| |_| |_|\\___|____/ \\___/ \\__|\n");
	}
};
