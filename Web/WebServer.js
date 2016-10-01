const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const session = require("express-session");
const mongooseSessionStore = require("connect-mongo")(session);
const passport = require("passport");
const discordStrategy = require("passport-discord").Strategy;
const discordOAuthScopes = ["identify", "guilds"];
const fs = require("fs");
const writeFile = require("write-file-atomic");
const showdown = require("showdown");
const md = new showdown.Converter();
md.setOption("tables", true);
const removeMd = require("remove-markdown");

const database = require("./../Database/Driver.js");
const prettyDate = require("./../Modules/PrettyDate.js");
const secondsToString = require("./../Modules/PrettySeconds.js");

var app = express();
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.use(express.static(__dirname + "/public"));
app.engine("ejs", ejs.renderFile);
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

// Setup the web server
module.exports = (bot, db, auth, config, winston) => {
	// Setup passport and express-session
	passport.use(new discordStrategy({
	    clientID: auth.platform.client_id,
	    clientSecret: auth.platform.client_secret,
	    callbackURL: config.hosting_url + "login/callback",
	    scope: discordOAuthScopes
	}, (accessToken, refreshToken, profile, done) => {
	    process.nextTick(() => {
	        return done(null, profile);
	    });
	}));
	passport.serializeUser((user, done) => {
		done(null, user);
	});
	passport.deserializeUser((user, done) => {
		done(null, user);
	});
	app.use(session({
	    secret: "vFEvmrQl811q2E8CZelg4438l9YFwAYd",
	    resave: false,
	    saveUninitialized: false,
		store: new mongooseSessionStore({
			mongooseConnection: database.getConnection()
		})
	}));
	app.use(passport.initialize());
	app.use(passport.session());

	// Landing page
	app.get("/", (req, res) => {
		res.render("pages/landing.ejs", {
			authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
			bannerMessage: config.homepage_message_html,
			rawServerCount: bot.guilds.size,
			roundedServerCount: Math.floor(bot.guilds.size/100)*100,
			rawUserCount: bot.users.size,
			rawUptime: secondsToString(process.uptime()).slice(0, -1),
			roundedUptime: Math.floor(process.uptime()/3600000)
		});
	});

	// Activity page (servers, profiles, etc.)
	app.get("/activity", (req, res) => {
		res.redirect("/activity/servers");
	});
	app.get("/activity/(|servers|users)", (req, res) => {
		db.servers.aggregate({
			$group: {
		        _id: null,
		        total: {
		        	$sum: {
		        		$add: ["$messages_today"]
		        	}
		        }
		    }
		}, (err, result) => {
			var messageCount = 0;
			if(!err && result) {
				messageCount = result[0].total;
			}
			db.servers.find({
				$where: "this.messages_today > 0"
			}, (err, serverDocuments) => {
				var activeServers = bot.guilds.size;
				if(!err && serverDocuments) {
					activeServers = serverDocuments.length;
				}

				if(req.path=="/activity/servers") {
					if(!req.query.q) {
						req.query.q = "";
					}
					if(!req.query.count) {
						req.query.count = 16;
					}
					if(!req.query.page) {
						req.query.page = 1;
					}
					if(!req.query.sort) {
						req.query.sort = "messages-des";
					}
					if(!req.query.category) {
						req.query.category = "All";
					}
					if(!req.query.publiconly) {
						req.query.publiconly = false;
					}

					var findCriteria = {
						"config.public_data.isShown": true
					};
					if(req.query.category!="All") {
						findCriteria["config.public_data.server_listing.category"] = req.query.category;
					}
					if(req.query.publiconly=="true") {
						findCriteria["config.public_data.server_listing.isEnabled"] = true;
					}
					db.servers.find(findCriteria).exec((err, serverDocuments) => {
						var serverData = [];
						var query = req.query.q.toLowerCase();
						for(var i=0; i<serverDocuments.length; i++) {
							var svr = bot.guilds.get(serverDocuments[i]._id);
							if(svr) {
								var data = {
									name: svr.name,
									id: svr.id,
									icon: svr.iconURL || "/img/discord-icon.png",
									owner: {
										username: svr.members.get(svr.ownerID).user.username,
										id: svr.members.get(svr.ownerID).id,
										avatar: svr.members.get(svr.ownerID).user.avatarURL || "/img/discord-icon.png",
										name: svr.members.get(svr.ownerID).nickname || svr.members.get(svr.ownerID).user.username
									},
									members: svr.members.size,
									messages: serverDocuments[i].messages_today,
									created: Math.ceil((Date.now() - svr.createdAt)/86400000),
									command_prefix: bot.getCommandPrefix(svr, serverDocuments[i]),
									category: serverDocuments[i].config.public_data.server_listing.category,
									description: serverDocuments[i].config.public_data.server_listing.isEnabled ? (md.makeHtml(serverDocuments[i].config.public_data.server_listing.description || "No description provided.")) : null,
									invite_link: serverDocuments[i].config.public_data.server_listing.isEnabled ? (serverDocuments[i].config.public_data.server_listing.invite_link || "javascript:alert('Invite link not available');") : null
								};
								if(query && data.name.toLowerCase().indexOf(query)==-1 && data.id!=query && data.owner.username.toLowerCase().indexOf(query)==-1 && (!data.description || data.description.toLowerCase().indexOf(query)==-1)) {
									continue;
								} else {
									serverData.push(data);
								}
							}
						}
						serverData.sort((a, b) => {
							switch(req.query.sort) {
								case "messages-asc":
									return a.messages - b.messages;
								case "messages-des":
									return b.messages - a.messages;
								case "alphabetical-asc":
									return a.name.localeCompare(b.name);
								case "alphabetical-des":
									return b.name.localeCompare(a.name);
								case "owner-asc":
									return a.owner.username.localeCompare(b.owner.username);
								case "owner-des":
									return b.owner.username.localeCompare(a.owner.username);
								case "members-asc":
									return a.members - b.members;
								case "members-des":
									return b.members - a.members;
								case "created-asc":
									return a.created - b.created;
								case "created-des":
									return b.created - a.created;
							}
						});
						var startItem = parseInt(req.query.count) * (parseInt(req.query.page) - 1);

						var pageTitle = "Servers";
						if(req.query.q) {
							pageTitle = "Search for server \"" + req.query.q + "\"";
						}
						renderPage({
							pageTitle: pageTitle,
							serverData: serverData.slice(startItem, startItem + (req.query.count=="0" ? serverData.length : parseInt(req.query.count))),
							selectedCategory: req.query.category,
							isPublicOnly: req.query.publiconly,
							sortOrder: req.query.sort,
							itemsPerPage: req.query.count,
							currentPage: req.query.page,
							numPages: Math.ceil(bot.guilds.size/((req.query.count=="0" ? bot.guilds.size : parseInt(req.query.count))))
						});
					});
				} else if(req.path=="/activity/users") {
					if(!req.query.q) {
						req.query.q = "";
					}

					var userProfile;
					if(req.query.q) {
						var usr = findQueryUser(req.query.q, bot.users);
						if(usr) {
							var sampleMember = bot.getFirstMember(usr);
							var mutualServers = bot.guilds.filter(svr => {
								return svr.members.has(usr.id);
							});
							userProfile = {
								username: usr.username,
								discriminator: usr.discriminator,
								avatar: usr.avatarURL || "/img/discord-icon.png",
								id: usr.id,
								status: sampleMember.status,
								game: bot.getGame(sampleMember),
								created: prettyDate(new Date(usr.createdAt)),
								roundedAccountAge: Math.ceil((Date.now() - usr.createdAt)/86400000),
								rawAccountAge: secondsToString((Date.now() - usr.createdAt)/1000),
								backgroundImage: "http://i.imgur.com/8UIlbtg.jpg",
								mutualServerCount: mutualServers.length,
								pastNameCount: 0,
								mutualServers: []
							};
							switch(userProfile.status) {
								case "online":
									userProfile.statusColor = "is-success";
									break;
								case "idle":
								case "away":
									userProfile.statusColor = "is-warning";
									break;
								case "offline":
								default:
									userProfile.statusColor = "is-dark";
									break;
							}
						}
					}
					db.users.find({}, (err, userDocuments) => {
						var totalPoints = 0;
						var publicProfilesCount = 0;
						var reminderCount = 0;
						var profileFieldCount = 0;
						var afkUserCount = 0;
						if(!err && userDocuments) {
							for(var i=0; i<userDocuments.length; i++) {
								totalPoints += userDocuments[i].points;
								if(userDocuments[i].isProfilePublic) {
									publicProfilesCount++;
								}
								reminderCount += userDocuments[i].reminders.length;
								if(userDocuments[i].profile_fields) {
									profileFieldCount += Object.keys(userDocuments[i].profile_fields).length;
								}
								if(userDocuments[i].afk_message) {
									afkUserCount++;
								}
								if(userProfile && userDocuments[i]._id==userProfile.id) {
									userProfile.backgroundImage = userDocuments[i].profile_background_image;
									userProfile.points = userDocuments[i].points;
									userProfile.rawLastSeen = secondsToString(Math.floor(((Date.now() - userDocuments[i].last_seen)/1000)/60)*60);
									userProfile.lastSeen = prettyDate(new Date(userDocuments[i].last_seen));
									userProfile.mutualServerCount = mutualServers.length;
									userProfile.pastNameCount = userDocuments[i].past_names.length;
									userProfile.isAfk = userDocuments[i].afk_message!=null && userDocuments[i].afk_message!="";
									if(userDocuments[i].isProfilePublic) {
										userProfile.profileFields = userDocuments[i].profile_fields;
										userProfile.pastNames = userDocuments[i].past_names;
										userProfile.afkMessage = userDocuments[i].afk_message;
										mutualServers.forEach(svr => {
											userProfile.mutualServers.push({
												name: svr.name,
												id: svr.id,
												icon: svr.iconURL || "/img/discord-icon.png",
												owner: svr.members.get(svr.ownerID).user.username
											});
										});
									}
								}
							}
						}
						if(userProfile && userProfile.points==null) {
							userProfile.points = 0;
						}

						var pageTitle = "Users";
						if(userProfile) {
							pageTitle = userProfile.username + " Profile";
						} else if(req.query.q) {
							pageTitle = "Search for user \"" + req.query.q + "\"";
						}
						renderPage({
							pageTitle: pageTitle,
							userProfile: userProfile,
							totalPoints: totalPoints,
							publicProfilesCount: publicProfilesCount,
							reminderCount: reminderCount,
							profileFieldCount: profileFieldCount,
							afkUserCount: afkUserCount,
						});
					});
				}

				function renderPage(data) {
					res.render("pages/activity.ejs", {
						authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
						rawServerCount: bot.guilds.size,
						rawUserCount: bot.users.size,
						rawUptime: secondsToString(process.uptime()).slice(0, -1),
						roundedUptime: Math.floor(process.uptime()/3600000),
						updatedPrettyDate: prettyDate(new Date()),
						totalMessageCount: messageCount,
						numActiveServers: activeServers,
						activeSearchQuery: req.query.q,
						mode: req.path.substring(req.path.lastIndexOf("/")+1),
						data: data
					});
				}
			});
		});
	});

	// Server list provider for typeahead
	app.get("/serverlist", (req, res) => {
		var servers = bot.guilds.map(svr => {
			return svr.name;
		});
		servers.sort();
		res.json(servers);
	});

	// User list provider for typeahead
	app.get("/userlist", (req, res) => {
		if(req.query.svrid) {
			checkAuth(req, res, (usr, svr) => {
				res.json(getUserList(svr.members.map(member => {
					return member.user;
				})));
			});
		} else {
			res.json(getUserList(bot.users));
		}
	});

	// Extension gallery
	app.get("/extensions", (req, res) => {
		res.redirect("/under-construction");
	});

	// Wiki page (documentation)
	app.get("/wiki", (req, res) => {
		var wikiPages = [];
		fs.readdir(__dirname + "/../Wiki/", (err, items) => {
			var searchQuery = "";
			var searchResults;
			var pageContent = "";
			var pageTitle = "AwesomeBot Wiki";
			if(req.query.q) {
				searchQuery = req.query.q;
				searchResults = [];
				for(var i=0; i<items.length; i++) {
					var content = removeMd(fs.readFileSync(__dirname + "/../Wiki/" + items[i], "utf8"));
					var title = items[i].substring(0, items[i].indexOf("."));
					var contentMatch = content.toLowerCase().indexOf(req.query.q);
					if(title.toLowerCase().indexOf(req.query.q)>-1 || contentMatch>-1) {
						var startIndex = contentMatch<300 ? 0 : (contentMatch - 300);
						var endIndex = contentMatch>content.length-300 ? content.length : (contentMatch + 300);
						searchResults.push({
							title: title,
							matchText: (startIndex>0 ? "..." : "") + content.substring(startIndex, contentMatch) + "<strong>" + req.query.q + "</strong>" + content.substring(contentMatch + req.query.q.length, endIndex) + (endIndex<content.length ? "..." : "")
						});
					}
				}
				pageTitle = "Search for \"" + req.query.q + "\" - AwesomeBot Wiki";
			} else {
				if(!req.query.page) {
					req.query.page = "Home";
				}
				if(items.indexOf(req.query.page + ".md")>-1) {
					pageContent = md.makeHtml(fs.readFileSync(__dirname + "/../Wiki/" + req.query.page + ".md", "utf8"));
				} else {
					pageContent = "That page doesn't exist. <a href='/wiki'>Take me home!</a>";
				}
				pageTitle = req.query.page + " - AwesomeBot Wiki";
			}
			res.render("pages/wiki.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				pageList: items,
				pageTitle: pageTitle,
				searchQuery: searchQuery,
				searchResults: searchResults,
				pageContent: pageContent
			});
		});
	});

	// Check authentication for console
	function checkAuth(req, res, next) {
		if(req.isAuthenticated()) {
			var usr = bot.users.get(req.user.id);
			if(usr) {
				if(req.query.svrid=="maintainer") {
					if(config.maintainers.indexOf(req.user.id)>-1) {
						next(usr);
					} else {
						res.redirect("/dashboard");
					}
				} else {
					var svr = bot.guilds.get(req.query.svrid);
					var serverDocument;
					if(svr && usr) {
						db.servers.findOne({_id: svr.id}, (err, serverDocument) => {
							if(!err && serverDocument) {
								var member = svr.members.get(usr.id);
								if(bot.getUserBotAdmin(svr, serverDocument, member)==3) {
									next(member, svr, serverDocument);
								} else {
									res.redirect("/dashboard");
								}
							} else {
								res.redirect("/error");
							}
						});
					} else {
						res.redirect("/error");
					}
				}
			} else {
				res.redirect("/error");
			}
		} else {
			res.redirect("/login");
		}
	}

	// Login to admin console
	app.get("/login", passport.authenticate("discord", {
		scope: discordOAuthScopes
	}));

	// Callback for Discord OAuth2
	app.get("/login/callback", passport.authenticate("discord", {
		failureRedirect: "/error"
	}), (req, res) => {
		res.redirect("/dashboard");
	});

	// Admin console dashboard
	app.get("/dashboard", (req, res) => {
		if(!req.isAuthenticated()) {
			res.redirect("/login");
		} else {
			var serverData = [];
			var usr = bot.users.get(req.user.id);
			function addServerData(i, callback) {
				if(i<req.user.guilds.length) {
					var svr = bot.guilds.get(req.user.guilds[i].id);
					var data = {
						name: req.user.guilds[i].name,
						id: req.user.guilds[i].id,
						icon: req.user.guilds[i].icon ? ("https://cdn.discordapp.com/icons/" + req.user.guilds[i].id + "/" + req.user.guilds[i].icon + ".jpg") : "/img/discord-icon.png",
						botJoined: svr!=null,
						isAdmin: false
					};
					if(svr && usr) {
						db.servers.findOne({_id: svr.id}, (err, serverDocument) => {
							if(!err && serverDocument) {
								var member = svr.members.get(usr.id);
								if(bot.getUserBotAdmin(svr, serverDocument, member)==3) {
									data.isAdmin = true;
									serverData.push(data);
								}
								addServerData(++i, callback);
							} else {
								addServerData(++i, callback);
							}
						});
					} else {
						serverData.push(data);
						addServerData(++i, callback);
					}
				} else {
					callback();
				}
			}
			addServerData(0, () => {
				serverData.sort((a, b) => {
					return a.name.localeCompare(b.name);
				});
				if(config.maintainers.indexOf(req.user.id)>-1) {
					serverData.push({
						name: "Maintainer Console",
						id: "maintainer",
						icon: "/img/transparent.png",
						botJoined: true,
						isAdmin: true
					});
				}
				res.render("pages/dashboard.ejs", {
					authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
					serverData: serverData,
					rawJoinLink: "https://discordapp.com/oauth2/authorize?&client_id=" + auth.platform.client_id + "&scope=bot&permissions=470019135"
				});
			});
		}
	});

	// Admin console overview (home)
	app.get("/dashboard/overview", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			// Redirect to maintainer console if necessary
			if(!svr) {
				res.redirect("/dashboard/maintainer?svrid=maintainer");
			} else {
				var topCommand;
				var topCommandUsage = 0;
				for(var cmd in serverDocument.command_usage) {
					if(serverDocument.command_usage[cmd]>topCommandUsage) {
						topCommand = cmd;
						topCommandUsage = serverDocument.command_usage[cmd];
					}
				}
				var topMemberID = serverDocument.members.sort((a, b) => {
					return b.messages - a.messages;
				})[0];
				var topMember = svr.members.get(topMemberID ? topMemberID._id : null);
				var memberIDs = svr.members.map(a => {
					return a.id;
				});
				db.users.find({
					_id: {
						"$in": memberIDs
					}
				}).sort({
					points: -1
				}).limit(1).exec((err, userDocuments) => {
					var richestMember;
					if(!err && userDocuments) {
						richestMember = svr.members.get(userDocuments[0]._id);
					}
					var topGame = serverDocument.games.sort((a, b) => {
						return b.time_played - a.time_played;
					})[0];
					res.render("pages/admin-overview.ejs", {
						authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
						serverData: {
							name: svr.name,
							id: svr.id,
							icon: svr.iconURL || "/img/discord-icon.png",
							owner: {
								username: svr.members.get(svr.ownerID).user.username,
								id: svr.members.get(svr.ownerID).id,
								avatar: svr.members.get(svr.ownerID).user.avatarURL || "/img/discord-icon.png"
							}
						},
						currentPage: req.path,
						messagesToday: serverDocument.messages_today,
						topCommand: topCommand,
						memberCount: svr.members.size,
						topMember: topMember ? {
							username: topMember.user.username,
							id: topMember.id,
							avatar: topMember.user.avatarURL || "/img/discord-icon.png"
						} : null,
						topGame: topGame ? topGame._id : null,
						richestMember: richestMember ? {
							username: richestMember.user.username,
							id: richestMember.id,
							avatar: richestMember.user.avatarURL || "/img/discord-icon.png"
						} : null
					});
				});
			}
		});
	});

	// TEMPORARY form submission handler
	app.post("/uc-submit", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			console.log(req.body);
			res.redirect(req.query.path + "?svrid=" + req.query.svrid);
		});
	});

	// Admin console command options
	app.get("/dashboard/commands/command-options", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-command-options.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					command_cooldown: serverDocument.config.command_cooldown,
					command_fetch_properties: serverDocument.config.command_fetch_properties,
					command_prefix: bot.getCommandPrefix(svr, serverDocument),
					delete_command_messages: serverDocument.config.delete_command_messages
				}
			});
		});
	});

	// Admin console command list
	app.get("/dashboard/commands/command-list", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-command-list.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					commands: serverDocument.toObject().config.commands
				},
				commandDescriptions: config.command_descriptions,
				pmCommandUsages: config.pm_command_usages,
				commandUsages: config.command_usages
			});
		});
	});

	// Admin console music
	app.get("/dashboard/commands/music", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-music.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				voiceChannelData: getChannelData(svr, 2),
				currentPage: req.path,
				configData: {
					commands: {
						music: serverDocument.toObject().config.commands.music,
						rss: {
							isEnabled: serverDocument.config.commands.rss.isEnabled
						},
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					},
					music_data: serverDocument.toObject().config.music_data
				},
				config: {
					max_voice_channels: config.max_voice_channels
				},
				commandDescriptions: {
					music: config.command_descriptions.music
				}
			});
		});
	});

	// Admin console RSS feeds
	app.get("/dashboard/commands/rss-feeds", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-rss-feeds.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					rss_feeds: serverDocument.toObject().config.rss_feeds,
					commands: {
						music: {
							isEnabled: serverDocument.config.commands.music.isEnabled
						},
						rss: serverDocument.config.commands.rss,
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					}
				},
				commandDescriptions: {
					rss: config.command_descriptions.rss
				}
			});
		});
	});

	// Admin console streamers
	app.get("/dashboard/commands/streamers", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-streamers.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					streamers_data: serverDocument.toObject().config.streamers_data,
					commands: {
						music: {
							isEnabled: serverDocument.config.commands.music.isEnabled
						},
						streamers: serverDocument.config.commands.streamers,
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					}
				},
				commandDescriptions: {
					streamers: config.command_descriptions.streamers
				}
			});
		});
	});

	// Admin console tags
	app.get("/dashboard/commands/tags", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			var data = {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					tags: serverDocument.toObject().config.tags,
					commands: {
						music: {
							isEnabled: serverDocument.config.commands.music.isEnabled
						},
						tag: serverDocument.config.commands.tag,
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					}
				},
				commandDescriptions: {
					tag: config.command_descriptions.tag
				}
			};
			function cleanTag(content) {
	            var cleanContent = "";
	            while(content.indexOf("<")>-1) {
	                cleanContent += content.substring(0, content.indexOf("<"));
	                content = content.substring(content.indexOf("<")+1);
	                if(content && content.indexOf(">")>1) {
	                    var type = content.charAt(0);
	                    var id = content.substring(1, content.indexOf(">"));
	                    if(!isNaN(id)) {
	                        if(type=='@') {
	                            var usr = svr.members.get(id);
	                            if(usr) {
	                                cleanContent += "<b>@" + usr.username + "</b>";
	                                content = content.substring(content.indexOf(">")+1);
	                                continue;
	                            }
	                        } else if(type=='#') {
	                            var ch = svr.channels.get(id);
	                            if(ch) {
	                                cleanContent += "<b>#" + ch.name + "</b>";
	                                content = content.substring(content.indexOf(">")+1);
	                                continue;
	                            }
	                        }
	                    }
	                }
	                cleanContent += "<";
	            }
	            cleanContent += content;
	            return cleanContent;
	        }
	        for(var i=0; i<data.configData.tags.list.length; i++) {
	        	data.configData.tags.list[i].content = cleanTag(data.configData.tags.list[i].content);
	        	data.configData.tags.list[i].index = i;
	        }
	        data.configData.tags.list.sort((a, b) => {
	    		return a._id.localeCompare(b._id);
	        });
			res.render("pages/admin-tags.ejs", data);
		});
	});

	// Admin console auto translation
	app.get("/dashboard/commands/auto-translation", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			var data = {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					translated_messages: serverDocument.toObject().config.translated_messages,
					commands: {
						music: {
							isEnabled: serverDocument.config.commands.music.isEnabled
						},
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					}
				}
			};
			for(var i=0; i<data.configData.translated_messages.length; i++) {
				var member = svr.members.get(data.configData.translated_messages[i]._id) || {};
				data.configData.translated_messages[i].username = member.user.username;
				data.configData.translated_messages[i].avatar = member.user.avatarURL || "/img/discord-icon.png";
			}
			res.render("pages/admin-auto-translation.ejs", data);
		});
	});

	// Admin console trivia sets
	app.get("/dashboard/commands/trivia-sets", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-trivia-sets.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					trivia_sets: serverDocument.toObject().config.trivia_sets,
					commands: {
						music: {
							isEnabled: serverDocument.config.commands.music.isEnabled
						},
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					}
				}
			});
		});
	});

	// Admin console API keys
	app.get("/dashboard/commands/api-keys", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-api-keys.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					custom_api_keys: serverDocument.toObject().config.custom_api_keys || {}
				}
			});
		});
	});

	// Admin console tag reaction
	app.get("/dashboard/commands/tag-reaction", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-tag-reaction.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					tag_reaction: serverDocument.toObject().config.tag_reaction
				}
			});
		});
	});

	// Admin console stats collection
	app.get("/dashboard/stats-points/stats-collection", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-stats-collection.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					commands: {
						games: serverDocument.toObject().config.commands.games,
						messages: serverDocument.toObject().config.commands.messages,
						stats: serverDocument.toObject().config.commands.stats
					}
				},
				commandDescriptions: {
					games: config.command_descriptions.games,
					messages: config.command_descriptions.messages,
					stats: config.command_descriptions.stats
				}
			});
		});
	});

	// Admin console ranks
	app.get("/dashboard/stats-points/ranks", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-ranks.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				roleData: getRoleData(svr),
				currentPage: req.path,
				configData: {
					commands: {
						ranks: serverDocument.toObject().config.commands.ranks
					},
					ranks_list: serverDocument.toObject().config.ranks_list.map(a => {
						a.members = serverDocument.members.filter(memberDocument => {
							return memberDocument.rank==a._id;
						}).length;
						return a;
					})
				},
				commandDescriptions: {
					ranks: config.command_descriptions.ranks
				}
			});
		});
	});

	// Admin console AwesomePoints
	app.get("/dashboard/stats-points/awesome-points", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-awesome-points.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					commands: {
						points: serverDocument.toObject().config.commands.points
					},
					points_lottery: serverDocument.config.points_lottery
				},
				commandDescriptions: {
					points: config.command_descriptions.points
				}
			});
		});
	});

	// Admin console admins
	app.get("/dashboard/management/admins", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-admins.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				roleData: getRoleData(svr).filter(role => {
					return serverDocument.config.admins.id(role.id)==null;
				}),
				currentPage: req.path,
				configData: {
					admins: serverDocument.toObject().config.admins.filter(adminDocument => {
						return svr.roles.has(adminDocument._id);
					}).map(adminDocument => {
						adminDocument.name = svr.roles.get(adminDocument._id).name;
						return adminDocument;
					}),
					auto_add_admins: serverDocument.toObject().config.auto_add_admins
				}
			});
		});
	});

	// Admin console moderation
	app.get("/dashboard/management/moderation", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-moderation.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				roleData: getRoleData(svr),
				currentPage: req.path,
				configData: {
					moderation: {
						isEnabled: serverDocument.toObject().config.moderation.isEnabled,
						autokick_members: serverDocument.toObject().config.moderation.autokick_members,
						new_member_roles: serverDocument.toObject().config.moderation.new_member_roles
					}
				}
			});
		});
	});

	// Admin console blocked
	app.get("/dashboard/management/blocked", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-blocked.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					blocked: svr.members.filter(member => {
						return serverDocument.config.blocked.indexOf(member.id)>-1;
					}).map(member => {
						return {
							name: member.user.username,
							id: member.id,
							avatar: member.user.avatarURL || "/img/discord-icon.png"
						};
					}),
					moderation: {
						isEnabled: serverDocument.toObject().config.moderation.isEnabled
					}
				}
			});
		});
	});

	// Admin console muted
	app.get("/dashboard/management/muted", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			var mutedMembers = [];
			svr.members.forEach(member => {
				var mutedChannels = [];
				svr.channels.filter(ch => {
					return ch.type==0;
				}).forEach(ch => {
					if(bot.isMuted(ch, member)) {
						mutedChannels.push(ch.id);
					}
				});
				if(mutedChannels.length>0) {
					mutedMembers.push({
						name: member.user.username,
						id: member.id,
						avatar: member.user.avatarURL || "/img/discord-icon.png",
						channels: mutedChannels
					});
				}
			});
			mutedMembers.sort((a, b) => {
				return a.name.localeCompare(b.name);
			});
			res.render("pages/admin-muted.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					moderation: {
						isEnabled: serverDocument.toObject().config.moderation.isEnabled
					}
				},
				muted: mutedMembers
			});
		});
	});

	// Admin console strikes
	app.get("/dashboard/management/strikes", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-strikes.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					moderation: {
						isEnabled: serverDocument.toObject().config.moderation.isEnabled
					}
				},
				strikes: serverDocument.members.filter(memberDocument => {
					return svr.members.has(memberDocument._id) && memberDocument.strikes.length>0;
				}).map(memberDocument => {
					var member = svr.members.get(memberDocument._id);
					return {
						name: member.user.username,
						id: member.id,
						avatar: member.user.avatarURL || "/img/discord-icon.png",
						strikes: memberDocument.strikes.map(strikeDocument => {
							var creator = svr.members.get(strikeDocument._id) || {
								id: "invalid-user",
								user: {
									username: "invalid-user",
									avatarURL: "/img/discord-icon.png"
								}
							};
							return {
								creator: {
									name: creator.user.username,
									id: creator.id,
									avatar: creator.avatarURL || "/img/discord-icon.png"
								},
								reason: md.makeHtml(strikeDocument.reason),
								rawDate: prettyDate(new Date(strikeDocument.timestamp)),
								relativeDate: Math.ceil((Date.now() - strikeDocument.timestamp))
							};
						})
					};
				})
			});
		});
	});

	// Admin console status messages
	app.get("/dashboard/management/status-messages", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			var statusMessagesData = serverDocument.toObject().config.moderation.status_messages;
			for(var i=0; i<statusMessagesData.member_streaming_message.enabled_user_ids.length; i++) {
				var member = svr.members.get(statusMessagesData.member_streaming_message.enabled_user_ids[i]) || {user: {}};
				statusMessagesData.member_streaming_message.enabled_user_ids[i] = {
					name: member.user.username,
					id: member.id,
					avatar: member.avatarURL || "/img/discord-icon.png"
				};
			}
			res.render("pages/admin-status-messages.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				configData: {
					moderation: {
						isEnabled: serverDocument.toObject().config.moderation.isEnabled,
						status_messages: statusMessagesData
					}
				}
			});
		});
	});

	// Admin console filters
	app.get("/dashboard/management/filters", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-filters.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				roleData: getRoleData(svr),
				currentPage: req.path,
				configData: {
					moderation: {
						isEnabled: serverDocument.toObject().config.moderation.isEnabled,
						filters: serverDocument.toObject().config.moderation.filters
					}
				},
				config: {
					filtered_commands: "<code>" + config.filtered_commands.join("</code>, <code>") + "</code>"
				}
			});
		});
	});

	// Admin console message of the day
	app.get("/dashboard/management/message-of-the-day", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-message-of-the-day.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				roleData: getRoleData(svr),
				currentPage: req.path,
				configData: {
					message_of_the_day: serverDocument.toObject().config.message_of_the_day
				}
			});
		});
	});

	// Admin console voicetext channels
	app.get("/dashboard/management/voicetext-channels", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-voicetext-channels.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				voiceChannelData: getChannelData(svr, 2),
				currentPage: req.path,
				configData: {
					voicetext_channels: serverDocument.toObject().config.voicetext_channels
				}
			});
		});
	});

	// Admin console roles
	app.get("/dashboard/management/roles", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-roles.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				roleData: getRoleData(svr),
				currentPage: req.path,
				configData: {
					commands: {
						perms: serverDocument.toObject().config.commands.perms,
						role: serverDocument.toObject().config.commands.role,
						roleinfo: serverDocument.toObject().config.commands.roleinfo
					},
					custom_colors: serverDocument.toObject().config.custom_colors,
					custom_roles: serverDocument.toObject().config.custom_roles
				},
				commandDescriptions: {
					perms: config.command_descriptions.perms,
					role: config.command_descriptions.role,
					roleinfo: config.command_descriptions.roleinfo
				}
			});
		});
	});

	// Admin console logs
	app.get("/dashboard/management/logs", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			winston.query({
				from: new Date - 48 * 60 * 60 * 1000,
			    until: new Date,
			    limit: 500,
			    order: "desc"
			}, (err, results) => {
				if(err) {
					res.redirect("/error");
				} else {
					results = results.file;
					var logs = [];
					for(var i=0; i<results.length; i++) {
						if(results[i].svrid && svr.id==results[i].svrid) {
							delete results[i].svrid;
							var ch = results[i].chid ? svr.channels.get(results[i].chid) : null;
							results[i].chid = ch ? ch.name : "invalid-channel";
							var member = results[i].usrid ? svr.members.get(results[i].usrid) : null;
							results[i].usrid = member ? (member.user.username + "#" + member.user.discriminator) : "invalid-user";
							switch(results[i].level) {
								case "warn":
									results[i].level = "exclamation";
									break;
								case "error":
									results[i].level = "times";
									break;
								default:
									results[i].level = "info";
									break;
							}
							results[i].timestamp = prettyDate(new Date(results[i].timestamp));
							logs.push(results[i]);
						}
					}
					
					res.render("pages/admin-logs.ejs", {
						authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
						serverData: {
							name: svr.name,
							id: svr.id,
							icon: svr.iconURL || "/img/discord-icon.png"
						},
						currentPage: req.path,
						logData: logs
					});
				}
			});
		});
	});

	// Admin console name display
	app.get("/dashboard/other/name-display", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-name-display.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					name_display: serverDocument.toObject().config.name_display
				},
				nameExample: bot.getName(svr, serverDocument, consolemember)
			});
		});
	});

	// Admin console ongoing activities
	app.get("/dashboard/other/ongoing-activities", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			var ongoingTrivia = [];
			var ongoingPolls = [];
			var ongoingGiveaways = [];
			var ongoingLotteries = [];
			serverDocument.channels.forEach(channelDocument => {
				var ch = svr.channels.get(channelDocument._id);
				if(ch) {
					if(channelDocument.trivia.isOngoing) {
						ongoingTrivia.push({
							channel: {
								name: ch.name,
								id: ch.id
							},
							set: channelDocument.trivia.set,
							score: channelDocument.trivia.score,
							max_score: channelDocument.trivia.max_score,
							responders: channelDocument.trivia.responders.length
						});
					}
					if(channelDocument.poll.isOngoing) {
						var creator = svr.members.get(channelDocument.poll.creator_id) || {user: "invalid-user"};
						ongoingPolls.push({
							title: channelDocument.poll.title,
							channel: {
								name: ch.name,
								id: ch.id
							},
							created: prettyDate(new Date(channelDocument.poll.created_timestamp)),
							creator: creator.user.username,
							options: channelDocument.poll.options.length,
							responses: channelDocument.poll.responses.length
						});
					}
					if(channelDocument.giveaway.isOngoing) {
						var creator = svr.members.get(channelDocument.giveaway.creator_id) || {user: "invalid-user"};
						ongoingGiveaways.push({
							title: channelDocument.giveaway.title,
							channel: {
								name: ch.name,
								id: ch.id
							},
							creator: creator.user.username,
							expiry: Math.ceil((channelDocument.giveaway.expiry_timestamp - Date.now())/3600000),
							participants: channelDocument.giveaway.participant_ids.length
						});
					}
					if(channelDocument.lottery.isOngoing) {
						ongoingLotteries.push({
							channel: {
								name: ch.name,
								id: ch.id
							},
							participants: channelDocument.giveaway.participant_ids.length
						});
					}
				}
			});
			res.render("pages/admin-ongoing-activities.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png",
					defaultChannel: svr.defaultChannel.name
				},
				currentPage: req.path,
				trivia: ongoingTrivia,
				polls: ongoingPolls,
				giveaways: ongoingGiveaways,
				lotteries: ongoingLotteries,
				commandPrefix: bot.getCommandPrefix(svr, serverDocument)
			});
		});
	});

	// Admin console public data
	app.get("/dashboard/other/public-data", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-public-data.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					public_data: serverDocument.toObject().config.public_data
				}
			});
		});
	});

	// Admin console extensions
	app.get("/dashboard/other/extensions", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.render("pages/admin-extensions.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path
			});
		});
	});

	// Admin console extension builder
	app.get("/dashboard/other/extension-builder", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.redirect("/under-construction");
		});
	});

	// Maintainer console overview
	app.get("/dashboard/maintainer", (req, res) => {
		checkAuth(req, res, consolemember => {
			db.servers.aggregate({
				$group: {
			        _id: null,
			        total: {
			        	$sum: {
			        		$add: ["$messages_today"]
			        	}
			        }
			    }
			}, (err, result) => {
				var messageCount = 0;
				if(!err && result) {
					messageCount = result[0].total;
				}
				res.render("pages/maintainer.ejs", {
					authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
					serverData: {
						name: bot.user.username,
						id: bot.user.id,
						icon: bot.user.avatarURL || "/img/discord-icon.png",
						isMaintainer: true
					},
					currentPage: req.path,
					serverCount: bot.guilds.size,
					userCount: bot.users.size,
					totalMessageCount: messageCount,
					roundedUptime: Math.floor(process.uptime()/3600000),
				});
			});
		});
	});

	// Maintainer console server list
	app.get("/dashboard/servers/server-list", (req, res) => {
		checkAuth(req, res, consolemember => {
			if(req.query.q) {
				var query = req.query.q.toLowerCase();
				var data = bot.guilds.filter(svr => {
					return svr.name.toLowerCase().indexOf(query)>-1 || svr.id==query || svr.members.get(svr.ownerID).user.username.toLowerCase().indexOf(query)>-1;
				}).map(svr => {
					return {
						name: svr.name,
						id: svr.id,
						icon: svr.iconURL || "/img/discord-icon.png",
						channelData: getChannelData(svr)
					};
				});

				if(req.query.message) {
					var svr = bot.guilds.get(data[parseInt(req.query.i)].id);
					if(svr) {
						var ch = svr.channels.get(req.query.chid);
						if(ch) {
							ch.createMessage(req.query.message);
							req.query.q = "";
							renderPage();
						} else {
							res.redirect("/error");
						}
					} else {
						res.redirect("/error");
					}
				} else if(req.query.leave!=undefined) {
					var svr = bot.guilds.get(data[parseInt(req.query.i)].id);
					if(svr) {
						svr.leave();
						req.query.q = "";
						renderPage();
					} else {
						res.redirect("/error");
					}
				} else {
					renderPage(data);
				}
			} else {
				renderPage();
			}

			function renderPage(data) {
				res.render("pages/maintainer-server-list.ejs", {
					authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
					serverData: {
						name: bot.user.username,
						id: bot.user.id,
						icon: bot.user.avatarURL || "/img/discord-icon.png",
						isMaintainer: true
					},
					currentPage: req.path,
					activeSearchQuery: req.query.q,
					selectedServer: req.query.i || "0",
					data: data
				});
			}
		});
	});

	// Maintainer console big message
	app.get("/dashboard/servers/big-message", (req, res) => {
		checkAuth(req, res, consolemember => {
			res.render("pages/maintainer-big-message.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: bot.user.username,
					id: bot.user.id,
					icon: bot.user.avatarURL || "/img/discord-icon.png",
					isMaintainer: true
				},
				currentPage: req.path,
				serverCount: bot.guilds.size
			});
		});
	});

	// Maintainer console blocklist
	app.get("/dashboard/global-options/blocklist", (req, res) => {
		checkAuth(req, res, consolemember => {
			res.render("pages/maintainer-blocklist.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: bot.user.username,
					id: bot.user.id,
					icon: bot.user.avatarURL || "/img/discord-icon.png",
					isMaintainer: true
				},
				currentPage: req.path,
				config: {
					global_blocklist: config.global_blocklist.map(a => {
						var usr = bot.users.get(a) || {};
						return {
							name: usr.username,
							id: usr.id,
							avatar: usr.avatarURL || "/img/discord-icon.png"
						};
					})
				}
			});
		});
	});

	// Maintainer console bot user options
	app.get("/dashboard/global-options/bot-user", (req, res) => {
		checkAuth(req, res, consolemember => {
			var sampleBotMember = bot.getFirstMember(bot.user);
			res.render("pages/maintainer-bot-user.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: bot.user.username,
					id: bot.user.id,
					icon: bot.user.avatarURL || "/img/discord-icon.png",
					isMaintainer: true
				},
				currentPage: req.path,
				bot_user: {
					status: sampleBotMember.status,
					game: bot.getGame(sampleBotMember),
					game_default: config.game=="default",
					avatar: bot.user.avatarURL
				}
			});
		});
	});

	// Maintainer console commands
	app.get("/dashboard/global-options/commands", (req, res) => {
		checkAuth(req, res, consolemember => {
			res.render("pages/maintainer-commands.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: bot.user.username,
					id: bot.user.id,
					icon: bot.user.avatarURL || "/img/discord-icon.png",
					isMaintainer: true
				},
				currentPage: req.path,
				config: {
					pm_commands: config.pm_commands,
					commands: config.commands,
					command_descriptions: config.command_descriptions,
					disabled_commands: config.disabled_commands,
					admin_commands: config.admin_commands,
					filtered_commands: config.filtered_commands
				}
			});
		});
	});

	// Maintainer console homepage options
	app.get("/dashboard/global-options/homepage", (req, res) => {
		checkAuth(req, res, consolemember => {
			res.render("pages/maintainer-homepage.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: bot.user.username,
					id: bot.user.id,
					icon: bot.user.avatarURL || "/img/discord-icon.png",
					isMaintainer: true
				},
				currentPage: req.path,
				config: {
					homepage_message_html: config.homepage_message_html
				}
			});
		});
	});

	// Maintainer console maintainers
	app.get("/dashboard/global-options/maintainers", (req, res) => {
		checkAuth(req, res, consolemember => {
			res.render("pages/maintainer-maintainers.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: bot.user.username,
					id: bot.user.id,
					icon: bot.user.avatarURL || "/img/discord-icon.png",
					isMaintainer: true
				},
				currentPage: req.path,
				config: {
					maintainers: config.maintainers.map(a => {
						var usr = bot.users.get(a) || {};
						return {
							name: usr.username,
							id: usr.id,
							avatar: usr.avatarURL || "/img/discord-icon.png"
						};
					}).sort((a, b) => {
						return a.name.localeCompare(b.name);
					})
				}
			});
		});
	});

	// Under construction for v4
	app.get("/under-construction", (req, res) => {
		res.render("pages/uc.ejs");
	});

	// Logout of admin console
	app.get("/logout", (req, res) => {
		req.logout();
	    res.redirect("/activity");
	});

	// Any other requests (redirect to error page)
	app.get("*", (req, res) => {
		res.status(404);
		res.render("pages/error.ejs");
	});

	app.use((req, res, next) => {
	    res.header("Access-Control-Allow-Origin", "*");
		res.header('Access-Control-Allow-Credentials', true);
	    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	    next();
	});

	// Handle errors (redirect to error page)
	app.use(function(error, req, res, next) {
		winston.error(error);
	    res.status(500);
	    res.render("pages/error.ejs", {error: error});
	});

	// Open web interface
	app.listen(config.server_port, config.server_ip, () => {
        winston.info("Opened web interface on " + config.server_ip + ":" + config.server_port);
        process.setMaxListeners(0);
    });
};

function findQueryUser(query, list) {
	var usr = list.get(query);
	if(!usr) {
		var usernameQuery = query.substring(0, query.lastIndexOf("----")>-1 ? query.lastIndexOf("----") : query.length);
		var discriminatorQuery = query.substring(query.lastIndexOf("----")+4);
		var usrs = list.filter(usr => {
			return usr.username==usernameQuery;
		});
		if(discriminatorQuery) { 
			usr = usrs.filter(a => {
				return a.discriminator==discriminatorQuery;
			})[0];
		} else if(usrs.length>0) {
			usr = usrs[0];
		}
	}
	return usr;
}

function getUserList(list) {
	return list.filter(usr => {
		return usr.bot!=true;
	}).map(usr => {
		return usr.username + "#" + usr.discriminator;
	}).sort();
}

function getChannelData(svr, type) {
	return svr.channels.filter(ch => {
		return ch.type==(type || 0);
	}).map(ch => {
		return {
			name: ch.name,
			id: ch.id,
			position: ch.position
		};
	}).sort((a, b) => {
		return a.position - b.position;
	});
}

function getRoleData(svr) {
	return svr.roles.filter(role => {
		return role.name!="@everyone" && role.name.indexOf("color-")!=0;
	}).map(role => {
		return {
			name: role.name,
			id: role.id,
			color: role.color.toString(16),
			position: role.position
		};
	}).sort((a, b) => {
		return a.position - b.position;
	});
}

function getAuthUser(user) {
	return {
		username: user.username,
		id: user.id,
		avatar: user.avatar ? ("https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".jpg") : "/img/discord-icon.png"
	};
}