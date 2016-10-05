const express = require("express");
const sio = require("socket.io");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const ejs = require("ejs");
const session = require("express-session");
const mongooseSessionStore = require("connect-mongo")(session);
const passport = require("passport");
const passportSocketIo = require("passport.socketio");
const discordStrategy = require("passport-discord").Strategy;
const discordOAuthScopes = ["identify", "email", "guilds"];
const path = require("path");
const fs = require("fs");
const writeFile = require("write-file-atomic");
const showdown = require("showdown");
const md = new showdown.Converter();
md.setOption("tables", true);
const removeMd = require("remove-markdown");
const base64 = require("node-base64-image");
const sizeof = require("object-sizeof");

const commands = require("./../Configuration/commands.json");
const database = require("./../Database/Driver.js");
const prettyDate = require("./../Modules/PrettyDate.js");
const secondsToString = require("./../Modules/PrettySeconds.js");

const app = express();
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static('static'));
app.set("json spaces", 2);

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
	passport.deserializeUser((id, done) => {
		done(null, id);
	});
	const sessionStore = new mongooseSessionStore({
		mongooseConnection: database.getConnection()
	});
	app.use(session({
	    secret: "vFEvmrQl811q2E8CZelg4438l9YFwAYd",
	    resave: false,
	    saveUninitialized: false,
		store: sessionStore
	}));
	app.use(passport.initialize());
	app.use(passport.session());

	app.use((req, res, next) => {
	    res.header("Access-Control-Allow-Origin", "*");
		res.header('Access-Control-Allow-Credentials', true);
	    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	    next();
	});

	// Handle errors (redirect to error page)
	app.use((error, req, res, next) => {
		winston.error(error);
	    res.sendStatus(500);
	    res.render("pages/error.ejs", {error: error});
	});

	// Open web interface
	const server = app.listen(config.server_port, config.server_ip, () => {
        winston.info("Opened web interface on " + config.server_ip + ":" + config.server_port);
        process.setMaxListeners(0);
    });

    // Setup socket.io for dashboard
	const io = sio(server);
	io.use(passportSocketIo.authorize({
		key: "connect.sid",
		secret: "vFEvmrQl811q2E8CZelg4438l9YFwAYd",
		store: sessionStore,
		passport: passport
	}));

	// Landing page
	app.get("/", (req, res) => {
		res.render("pages/landing.ejs", {
			authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
			bannerMessage: config.homepage_message_html,
			rawServerCount: bot.guilds.size,
			roundedServerCount: Math.floor(bot.guilds.size/100)*100,
			rawUserCount: bot.users.size,
			rawUptime: secondsToString(process.uptime()).slice(0, -1),
			roundedUptime: Math.floor(process.uptime()/3600)
		});
	});

	// AwesomeBot data API
	app.get("/api/servers", (req, res) => {
		var params = {
			"config.public_data.isShown": true
		};
		if(req.query.id) {
			params["_id"] = req.query.id;
		}
		db.servers.find(params, (err, serverDocuments) => {
			if(!err && serverDocuments) {
				var data = [];
				var startIndex = req.query.start ? parseInt(req.query.start) : 0;
				var endIndex = req.query.count ? (startIndex + parseInt(req.query.count)) : serverDocuments.length;
				for(var i=startIndex; i<serverDocuments.length; i++) {
					data.push(getServerData(serverDocuments[i]) || serverDocuments[i]._id);
					if(i==endIndex-1) {
						break;
					}
				}
				res.json(data);
			} else {
				res.sendStatus(400);
			}
		})
	});
	app.get("/api/users", (req, res) => {
		var usr = bot.users.get(req.query.id);
		if(usr) {
			db.users.findOrCreate({_id: usr.id}, (err, userDocument) => {
				if(err || !userDocument) {
					userDocument = {};
				}
				res.json(getUserData(usr, userDocument));
			});
		} else {
			res.sendStatus(400);
		}
	});
	app.get("/api/extensions", (req, res) => {
		var params = {};
		if(req.query.id) {
			params["_id"] = req.query.id;
		}
		if(req.query.name) {
			params["name"] = req.query.name;
		}
		if(req.query.type) {
			params["type"] = req.query.type;
		}
		if(req.query.status) {
			params["state"] = req.query.status;
		}
		if(req.query.owner) {
			params["owner_id"] = req.query.owner;
		}
		db.gallery.find(params, (err, galleryDocuments) => {
			if(!err && galleryDocuments) {
				var data = [];
				var startIndex = req.query.start ? parseInt(req.query.start) : 0;
				var endIndex = req.query.count ? (startIndex + parseInt(req.query.count)) : galleryDocuments.length;
				for(var i=startIndex; i<galleryDocuments.length; i++) {
					data.push(getExtensionData(galleryDocuments[i]));
					if(i==endIndex-1) {
						break;
					}
				}
				res.json(data);
			} else {
				res.sendStatus(400);
			}
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
							var data = getServerData(serverDocuments[i]);
							if(data) {
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
							itemsPerPage: req.query.count,
							currentPage: parseInt(req.query.page),
							numPages: Math.ceil(serverData.length/((req.query.count=="0" ? serverData.length : parseInt(req.query.count)))),
							serverData: serverData.slice(startItem, startItem + (req.query.count=="0" ? serverData.length : parseInt(req.query.count))),
							selectedCategory: req.query.category,
							isPublicOnly: req.query.publiconly,
							sortOrder: req.query.sort
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
							db.users.findOrCreate({_id: usr.id}, (err, userDocument) => {
								if(err || !userDocument) {
									userDocument = {};
								}
								var userProfile = getUserData(usr, userDocument);
								renderPage({
									pageTitle: userProfile.username + "'s Profile",
									userProfile: userProfile
								});
							});
						} else {
							renderPage({pageTitle: "Search for user \"" + req.query.q + "\""});
						}
					} else {
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
								}
							}
							renderPage({
								pageTitle: "Users",
								totalPoints: totalPoints,
								publicProfilesCount: publicProfilesCount,
								reminderCount: reminderCount,
								profileFieldCount: profileFieldCount,
								afkUserCount: afkUserCount,
							});
						});
					}
				}

				function renderPage(data) {
					res.render("pages/activity.ejs", {
						authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
						rawServerCount: bot.guilds.size,
						rawUserCount: bot.users.size,
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
	function getServerData(serverDocument) {
		var data;
		var svr = bot.guilds.get(serverDocument._id);
		if(svr) {
			data = {
				name: svr.name,
				id: svr.id,
				icon: svr.iconURL || "/img/discord-icon.png",
				owner: {
					username: svr.members.get(svr.ownerID).user.username,
					id: svr.members.get(svr.ownerID).id,
					avatar: svr.members.get(svr.ownerID).user.avatarURL || "/img/discord-icon.png",
					name: svr.members.get(svr.ownerID).nick || svr.members.get(svr.ownerID).user.username
				},
				members: svr.members.size,
				messages: serverDocument.messages_today,
				created: Math.ceil((Date.now() - svr.createdAt)/86400000),
				command_prefix: bot.getCommandPrefix(svr, serverDocument),
				category: serverDocument.config.public_data.server_listing.category,
				description: serverDocument.config.public_data.server_listing.isEnabled ? (md.makeHtml(serverDocument.config.public_data.server_listing.description || "No description provided.")) : null,
				invite_link: serverDocument.config.public_data.server_listing.isEnabled ? (serverDocument.config.public_data.server_listing.invite_link || "javascript:alert('Invite link not available');") : null
			};
		}
		return data;
	}
	function getUserData(usr, userDocument) {
		var sampleMember = bot.getFirstMember(usr);
		var mutualServers = bot.guilds.filter(svr => {
			return svr.members.has(usr.id);
		});
		var userProfile = {
			username: usr.username,
			discriminator: usr.discriminator,
			avatar: usr.avatarURL || "/img/discord-icon.png",
			id: usr.id,
			status: sampleMember.status,
			game: bot.getGame(sampleMember),
			created: prettyDate(new Date(usr.createdAt)),
			roundedAccountAge: Math.ceil((Date.now() - usr.createdAt)/86400000),
			rawAccountAge: secondsToString((Date.now() - usr.createdAt)/1000),
			backgroundImage: userDocument.profile_background_image || "http://i.imgur.com/8UIlbtg.jpg",
			points: userDocument.points || 1,
			rawLastSeen: secondsToString(userDocument.last_seen ? (Math.floor(((Date.now() - userDocument.last_seen)/1000)/60)*60) : 0),
			lastSeen: prettyDate(userDocument.last_seen ? new Date(userDocument.last_seen) : new Date()),
			mutualServerCount: mutualServers.length,
			pastNameCount: (userDocument.past_names || {}).length || 0,
			isAfk: userDocument.afk_message!=null && userDocument.afk_message!="",
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
		if(userDocument.isProfilePublic) {
			userProfile.profileFields = userDocument.profile_fields;
			userProfile.pastNames = userDocument.past_names;
			userProfile.afkMessage = userDocument.afk_message;
			mutualServers.forEach(svr => {
				userProfile.mutualServers.push({
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png",
					owner: svr.members.get(svr.ownerID).user.username
				});
			});
		}
		return userProfile;
	}

	// Header image provider
	app.get("/header-image", (req, res) => {
		res.sendFile(__dirname + "/public/img/" + config.header_image)
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
		res.redirect("/extensions/gallery");
	});
	app.post("/extensions", (req, res) => {
		if(req.isAuthenticated()) {
			if(req.query.extid && req.body.action) {
				if(["accept", "feature", "reject", "remove"].indexOf(req.body.action)>-1 && config.maintainers.indexOf(req.user.id)==-1) {
					res.sendStatus(403);
					return;
				}
				switch(req.body.action) {
					case "upvote":
						getGalleryDocument(galleryDocument => {
							getUserDocument(userDocument => {
								var vote = userDocument.upvoted_gallery_extensions.indexOf(galleryDocument._id)==-1 ? 1 : -1;
								if(vote==1) {
									userDocument.upvoted_gallery_extensions.push(galleryDocument._id);
								} else {
									userDocument.upvoted_gallery_extensions.splice(userDocument.upvoted_gallery_extensions.indexOf(galleryDocument._id), 1);
								}
								galleryDocument.points += vote;
								galleryDocument.save(err => {
									userDocument.save(err => {
										db.users.findOrCreate({_id: galleryDocument.owner_id}, (err, ownerUserDocument) => {
											if(!err && ownerUserDocument) {
												ownerUserDocument.points += vote * 10;
												ownerUserDocument.save(err => {});
											}
											res.sendStatus(200);
										});
									});
								});
							});
						});
						break;
					case "accept":
						getGalleryDocument(galleryDocument => {
							messageOwner(galleryDocument.owner_id, "Your extension " + galleryDocument.name + " has been accepted to the AwesomeBot extension gallery! 🎉 " + config.hosting_url + "extensions/gallery?q=" + galleryDocument._id);
							galleryDocument.state = "gallery";
							galleryDocument.save(err => {
								res.sendStatus(err ? 500 : 200);
							});
						});
						break;
					case "feature":
						getGalleryDocument(galleryDocument => {
							if(!galleryDocument.featured) {
								messageOwner(galleryDocument.owner_id, "Your extension " + galleryDocument.name + " has been featured on the AwesomeBot extension gallery! 🌟 " + config.hosting_url + "extensions/gallery?q=" + galleryDocument._id);
							}
							galleryDocument.featured = galleryDocument.featured!=true;
							galleryDocument.save(err => {
								res.sendStatus(err ? 500 : 200);
							});
						});
						break;
					case "reject":
					case "remove":
						getGalleryDocument(galleryDocument => {
							messageOwner(galleryDocument.owner_id, "Your extension " + galleryDocument.name + " has been " + req.body.action + (req.body.action=="reject" ? "e" : "") + "d from the AwesomeBot extension gallery for the following reason:```" + req.body.reason + "```");
							db.users.findOrCreate({_id: galleryDocument.owner_id}, (err, ownerUserDocument) => {
								if(!err && ownerUserDocument) {
									ownerUserDocument.points -= galleryDocument.points * 10;
									ownerUserDocument.save(err => {});
								}
								db.gallery.findByIdAndRemove(galleryDocument._id, err => {
									try {
										fs.unlinkSync(__dirname + "/../Extensions/gallery-" + galleryDocument._id + ".abext");
									} catch(err) {}
									res.sendStatus(err ? 500 : 200);
								});
							});
						});
						break;
				}
				function getGalleryDocument(callback) {
					db.gallery.findOne({_id: req.query.extid}, (err, galleryDocument) => {
						if(!err && galleryDocument) {
							callback(galleryDocument);
						} else {
							res.sendStatus(500);
						}
					});
				}
				function getUserDocument(callback) {
					db.users.findOrCreate({_id: req.user.id}, (err, userDocument) => {
						if(!err && userDocument) {
							callback(userDocument);
						} else {
							res.sendStatus(500);
						}
					});
				}
				function messageOwner(usrid, message) {
					var usr = bot.users.get(usrid);
					if(usr) {
						usr.getDMChannel().then(ch => {
							ch.createMessage(message);
						}).catch();
					}
				}
			} else {
				res.sendStatus(400);
			}
		} else {
			res.sendStatus(403);
		}
	});
	app.get("/extension.abext", (req, res) => {
		if(req.query.extid) {
			try {
				res.set({
				    "Content-Disposition": "attachment; filename='" + "gallery-" + req.query.extid + ".abext" + "'",
				    "Content-Type": "text/javascript"
				});
				res.sendFile(path.resolve(__dirname + "/../Extensions/gallery-" + req.query.extid + ".abext"));
			} catch(err) {
				res.sendStatus(500);
			}
		} else {
			res.sendStatus(400);
		}
	});
	app.get("/extensions/(|gallery|queue)", (req, res) => {
		if(req.isAuthenticated()) {
			if(!req.query.count) {
				req.query.count = 18;
			}
			if(!req.query.page) {
				req.query.page = 1;
			}

			var serverData = [];
			var usr = bot.users.get(req.user.id);
			function addServerData(i, callback) {
				if(i<req.user.guilds.length) {
					var svr = bot.guilds.get(req.user.guilds[i].id);
					if(svr && usr) {
						db.servers.findOne({_id: svr.id}, (err, serverDocument) => {
							if(!err && serverDocument) {
								var member = svr.members.get(usr.id);
								if(bot.getUserBotAdmin(svr, serverDocument, member)==3) {
									serverData.push({
										name: req.user.guilds[i].name,
										id: req.user.guilds[i].id,
										icon: req.user.guilds[i].icon ? ("https://cdn.discordapp.com/icons/" + req.user.guilds[i].id + "/" + req.user.guilds[i].icon + ".jpg") : "/img/discord-icon.png"
									});
								}
							}
							addServerData(++i, callback);
						});
					} else {
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
				db.users.findOne({_id: req.user.id}, (err, userDocument) => {
					if(!err && userDocument) {
						renderPage(userDocument.upvoted_gallery_extensions, serverData);
					} else {
						renderPage([], serverData);
					}
				});
			});
		} else {
			renderPage();
		}
		function renderPage(upvoted_gallery_extensions, serverData) {
			var extensionState = req.path.substring(req.path.lastIndexOf("/")+1);
			db.gallery.find({
				state: extensionState
			}, (err, galleryDocuments) => {
				var pageTitle = extensionState.charAt(0).toUpperCase() + extensionState.slice(1) + " - AwesomeBot Extensions";
				if(req.query.q) {
					pageTitle = "Search for \"" + req.query.q + "\" in " + extensionState.charAt(0).toUpperCase() + extensionState.slice(1) + " - AwesomeBot Extensions";
					var query = req.query.q.toLowerCase();
					galleryDocuments = galleryDocuments.filter(galleryDocument => {
						return galleryDocument._id==query || galleryDocument.name.toLowerCase().indexOf(query)>-1 || galleryDocument.description.toLowerCase().indexOf(query)>-1 || galleryDocument.owner_id==query;
					});
				}
				var extensionData = galleryDocuments.sort((a, b) => {
					if(a.featured && !b.featured) {
						return -1;
					} else if(!a.featured && b.featured) {
						return 1;
					} else if(a.points!=b.points) {
						return b.points - a.points;
					} else {
						return new Date(b.last_updated) - new Date(a.last_updated);
					}
				}).map(getExtensionData);

				var startItem = parseInt(req.query.count) * (parseInt(req.query.page) - 1);
				res.render("pages/extensions.ejs", {
					authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
					isMaintainer: req.isAuthenticated() ? config.maintainers.indexOf(req.user.id)>-1 : false,
					pageTitle: pageTitle,
					serverData: serverData,
					activeSearchQuery: req.query.q,
					mode: extensionState,
					rawCount: extensionData.length,
					itemsPerPage: req.query.count,
					currentPage: parseInt(req.query.page),
					numPages: Math.ceil(extensionData.length/((req.query.count=="0" ? extensionData.length : parseInt(req.query.count)))),
					extensions: extensionData.slice(startItem, startItem + (req.query.count=="0" ? extensionData.length : parseInt(req.query.count))),
					upvotedData: upvoted_gallery_extensions
				});
			});
		}
	});
	function getExtensionData(galleryDocument) {
		var owner = bot.users.get(galleryDocument.owner_id) || {};
		switch(galleryDocument.type) {
			case "command":
				var typeIcon = "magic";
				var typeDescription = galleryDocument.key;
				break;
			case "keyword":
				var typeIcon = "key";
				var typeDescription = galleryDocument.keywords.join(", ");
				break;
			case "timer":
				var typeIcon = "clock-o";
				var typeDescription = "Runs every " + secondsToString(galleryDocument.interval/1000).slice(0, -1);
				break;
		}
		return {
			_id: galleryDocument._id,
			name: galleryDocument.name,
			type: galleryDocument.type,
			typeIcon: typeIcon,
			typeDescription: typeDescription,
			description: md.makeHtml(galleryDocument.description),
			featured: galleryDocument.featured,
			owner: {
				name: owner.username || "invalid-user",
				id: owner.id || "invalid-user",
				discriminator: owner.discriminator || "0000",
				avatar: owner.avatarURL || "/img/discord-icon.png"
			},
			status: galleryDocument.state,
			points: galleryDocument.points,
			relativeLastUpdated: Math.floor((new Date() - new Date(galleryDocument.last_updated))/86400000),
			rawLastUpdated: prettyDate(new Date(galleryDocument.last_updated))
		};
	}

	// My extensions
	app.get("/extensions/my", (req, res) => {
		if(req.isAuthenticated()) {
			db.gallery.find({
				owner_id: req.user.id
			}, (err, galleryDocuments) => {
				res.render("pages/extensions.ejs", {
					authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
					currentPage: req.path,
					pageTitle: "My AwesomeBot Extensions",
					serverData: {
						id: req.user.id
					},
					activeSearchQuery: req.query.q,
					mode: "my",
					rawCount: (galleryDocuments || []).length,
					extensions: galleryDocuments || []
				});
			});
		} else {
			res.redirect("/login");
		}
	});
	io.of("/extensions/my").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/extensions/my", (req, res) => {
		if(req.isAuthenticated()) {
			db.gallery.find({
				owner_id: req.user.id
			}, (err, galleryDocuments) => {
				if(!err && galleryDocuments) {
					for(var i=0; i<galleryDocuments.length; i++) {
						if(req.body["extension-" + i + "-removed"]!=null) {
							db.gallery.findByIdAndRemove(galleryDocuments[i]._id).exec();
							try {
								fs.unlinkSync(__dirname + "/../Extensions/gallery-" + galleryDocuments[i]._id + ".abext");
							} catch(err) {}
							break;
						}
					}
					io.of(req.path).emit("update", req.user.id);
					res.redirect(req.originalUrl);
				} else {
					res.redirect("/error");
				}
			});
		} else {
			res.redirect("/login");
		}
	});

	// Extension builder
	app.get("/extensions/builder", (req, res) => {
		if(req.isAuthenticated()) {
			if(req.query.extid) {
				db.gallery.findOne({
					_id: req.query.extid,
					owner_id: req.user.id
				}, (err, galleryDocument) => {
					if(!err && galleryDocument) {
						try {
							galleryDocument.code = fs.readFileSync(__dirname + "/../Extensions/gallery-" + galleryDocument._id + ".abext");
						} catch(err) {
							galleryDocument.code = "";
						}
						renderPage(galleryDocument);
					} else {
						renderPage({});
					}
				});
			} else {
				renderPage({});
			}
			function renderPage(extensionData) {
				res.render("pages/extensions.ejs", {
					authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
					currentPage: req.path,
					pageTitle: (extensionData.name ? (extensionData.name + " - ") : "") + "AwesomeBot Extension Builder",
					serverData: {
						id: req.user.id
					},
					activeSearchQuery: req.query.q,
					mode: "builder",
					extensionData: extensionData
				});
			}
		} else {
			res.redirect("/login");
		}
	});
	io.of("/extensions/builder").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/extensions/builder", (req, res) => {
		if(req.isAuthenticated()) {
			if(validateExtensionData(req.body)) {
				if(req.query.extid) {
					db.gallery.findOne({
						_id: req.query.extid,
						owner_id: req.user.id
					}, (err, galleryDocument) => {
						if(!err && galleryDocument) {
							saveExtensionData(galleryDocument, true);
						} else {
							saveExtensionData(new db.gallery(), false);
						}
					});
				} else {
					saveExtensionData(new db.gallery(), false);
				}
				function saveExtensionData(galleryDocument, isUpdate) {
					galleryDocument.level = "gallery";
					galleryDocument.state = "queue";
					galleryDocument.description = req.body.description;
					writeExtensionData(galleryDocument, req.body);

					if(!isUpdate) {
						galleryDocument.owner_id = req.user.id;
						io.of("/extensions/my").emit("update", req.user.id);
					}
					galleryDocument.save(err => {
						if(!err && !req.query.extid) {
							req.originalUrl += "extid=" + galleryDocument._id;
						}
						saveExtensionCode(err, galleryDocument._id);
					});
				}
				function saveExtensionCode(err, extid) {
					if(err) {
						winston.error("Failed to update settings at " + req.path, {usrid: req.user.id}, err);
						sendResponse();
					} else {
						writeFile(__dirname + "/../Extensions/gallery-" + extid + ".abext", req.body.code, err => {
							sendResponse();
						});
					}
				}
				function sendResponse() {
					io.of(req.path).emit("update", req.user.id);
					if(req.query.external=="true") {
						res.sendStatus(200);
					} else {
						res.redirect(req.originalUrl);
					}
				}
			} else {
				res.redirect("/error");
			}
		} else {
			res.redirect("/login");
		}
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
					if(items[0].indexOf(".")!=0 && items[0].endsWith(".md")) {
						try {
							var content = removeMd(fs.readFileSync(__dirname + "/../Wiki/" + items[i], "utf8"));
						} catch(err) {
							continue;
						}
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
				pageList: items.filter(a => {
					return a.indexOf(".")!=0 && a.endsWith(".md");
				}),
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

	// Save serverDocument after admin console form data is received
	function saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res, override) {
		serverDocument.save(err => {
			io.of(req.path).emit("update", svr.id);
			if(err) {
				winston.error("Failed to update settings at " + req.path, {svrid: svr.id, usrid: consolemember.id}, err);
			}
			if(override) {
				res.sendStatus(200);
			} else {
				res.redirect(req.originalUrl);
			}
		});
	}

	// Save config.json after maintainer console form data is received
	function saveMaintainerConsoleOptions(consolemember, req, res) {
		io.of(req.path).emit("update", "maintainer");
		writeFile(__dirname + "/../Configuration/config.json", JSON.stringify(config, null, 4), err => {
			if(err) {
				winston.error("Failed to update settings at " + req.path, {usrid: consolemember.id}, err);
			}
			res.redirect(req.originalUrl);
		});
	}

	// Login to admin console
	app.get("/login", passport.authenticate("discord", {
		scope: discordOAuthScopes
	}));

	// Callback for Discord OAuth2
	app.get("/login/callback", passport.authenticate("discord", {
		failureRedirect: "/error"
	}), (req, res) => {
		if(config.global_blocklist.indexOf(req.user.id)>-1 || !req.user.verified) {
			req.logout();
		} else {
			res.redirect("/dashboard");
		}
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
					if(!err && userDocuments && userDocuments.length>0) {
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
	io.of("/dashboard/commands/command-options").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/command-options", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body.command_prefix!=bot.getCommandPrefix(svr, serverDocument)) {
				serverDocument.config.command_prefix = req.body.command_prefix;
			}
			serverDocument.config.delete_command_messages = req.body.delete_command_messages=="on";
			serverDocument.config.command_cooldown = parseInt(req.body.command_cooldown);
			serverDocument.config.command_fetch_properties.default_count = parseInt(req.body.default_count);
			serverDocument.config.command_fetch_properties.max_count = parseInt(req.body.max_count);

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
		});
	});

	// Admin console command list
	app.get("/dashboard/commands/command-list", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			var commandDescriptions = {};
			for(var command in commands.public) {
				commandDescriptions[command] = commands.public[command].description;
			}
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
				commandDescriptions: commandDescriptions
			});
		});
	});
	io.of("/dashboard/commands/command-list").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/command-list", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			for(var command in serverDocument.toObject().config.commands) {
				parseCommandOptions(svr, serverDocument, command, req.body);
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
					music: commands.public.music.description
				}
			});
		});
	});
	io.of("/dashboard/commands/music").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/music", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(Object.keys(req.body).length==1) {
				if(req.body["new-name"] && !serverDocument.config.music_data.playlists.id(req.body["new-name"])) {
					serverDocument.config.music_data.playlists.push({
						_id: req.body["new-name"]
					});
				} else {
					var args = Object.keys(req.body)[0].split("-");
					if(args[0]=="new" && args[2]=="item" && args[1] && !isNaN(args[1]) && args[1]>=0 && args[1]<serverDocument.config.music_data.playlists.length) {
						serverDocument.config.music_data.playlists[parseInt(args[1])].item_urls.push(req.body[Object.keys(req.body)[0]]);
					}
				}
			} else {
				parseCommandOptions(svr, serverDocument, "music", req.body);
				serverDocument.config.music_data.addingQueueIsAdminOnly = req.body.addingQueueIsAdminOnly=="true";
				serverDocument.config.music_data.removingQueueIsAdminOnly = req.body.removingQueueIsAdminOnly=="true";
				serverDocument.config.music_data.channel_id = req.body.channel_id;
				for(var i=0; i<serverDocument.config.music_data.playlists.length; i++) {
					if(req.body["playlist-" + i + "-removed"]!=null) {
						serverDocument.config.music_data.playlists[i] = null;
					} else {
						for(var j=0; j<serverDocument.config.music_data.playlists[i].item_urls.length; j++) {
							if(req.body["playlist-" + i + "-item-" + j + "-removed"]!=null) {
								serverDocument.config.music_data.playlists[i].item_urls.splice(j, 1);
							}
						}
					}
				}
				serverDocument.config.music_data.playlists.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
						rss: serverDocument.config.commands.rss,
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					}
				},
				commandDescriptions: {
					rss: commands.public.rss.description
				}
			});
		});
	});
	io.of("/dashboard/commands/rss-feeds").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/rss-feeds", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-url"] && req.body["new-name"] && !serverDocument.config.rss_feeds.id(req.body["new-name"])) {
				serverDocument.config.rss_feeds.push({
					_id: req.body["new-name"],
					url: req.body["new-url"]
				});
			} else {
				parseCommandOptions(svr, serverDocument, "rss", req.body);
				for(var i=0; i<serverDocument.config.rss_feeds.length; i++) {
					if(req.body["rss-" + i + "-removed"]!=null) {
						serverDocument.config.rss_feeds[i] = null;
					} else {
						serverDocument.config.rss_feeds[i].streaming.isEnabled = req.body["rss-" + i + "-streaming-isEnabled"]=="on";
						serverDocument.config.rss_feeds[i].streaming.enabled_channel_ids = [];
						svr.channels.forEach(ch => {
							if(ch.type==0) {
								if(req.body["rss-" + i + "-streaming-enabled_channel_ids-" + ch.id]=="on") {
									serverDocument.config.rss_feeds[i].streaming.enabled_channel_ids.push(ch.id);
								}
							}
						});
					}
				}
				serverDocument.config.rss_feeds.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
						streamers: serverDocument.config.commands.streamers,
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					}
				},
				commandDescriptions: {
					streamers: commands.public.streamers.description
				}
			});
		});
	});
	io.of("/dashboard/commands/streamers").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/streamers", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-name"] && req.body["new-type"] && !serverDocument.config.streamers_data.id(req.body["new-name"])) {
				serverDocument.config.streamers_data.push({
					_id: req.body["new-name"],
					type: req.body["new-type"]
				});
			} else {
				parseCommandOptions(svr, serverDocument, "streamers", req.body);
				for(var i=0; i<serverDocument.config.streamers_data.length; i++) {
					if(req.body["streamer-" + i + "-removed"]!=null) {
						serverDocument.config.streamers_data[i] = null;
					} else {
						serverDocument.config.streamers_data[i].channel_id = req.body["streamer-" + i + "-channel_id"];
					}
				}
				serverDocument.config.streamers_data.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
						tag: serverDocument.config.commands.tag,
						trivia: {
							isEnabled: serverDocument.config.commands.trivia.isEnabled
						}
					}
				},
				commandDescriptions: {
					tag: commands.public.tag.description
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
	io.of("/dashboard/commands/tags").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/tags", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-name"] && req.body["new-type"] && req.body["new-content"] && !serverDocument.config.tags.list.id(req.body["new-name"])) {
				serverDocument.config.tags.list.push({
					_id: req.body["new-name"],
					content: req.body["new-content"],
					isCommand: req.body["new-type"]=="command"
				});
			} else {
				parseCommandOptions(svr, serverDocument, "tag", req.body);
				serverDocument.config.tags.listIsAdminOnly = req.body.listIsAdminOnly=="true";
				serverDocument.config.tags.addingIsAdminOnly = req.body.addingIsAdminOnly=="true";
				serverDocument.config.tags.addingCommandIsAdminOnly = req.body.addingCommandIsAdminOnly=="true";
				serverDocument.config.tags.removingIsAdminOnly = req.body.removingIsAdminOnly=="true";
				serverDocument.config.tags.removingCommandIsAdminOnly = req.body.removingCommandIsAdminOnly=="true";
				for(var i=0; i<serverDocument.config.tags.list.length; i++) {
					if(req.body["tag-" + i + "-removed"]!=null) {
						serverDocument.config.tags.list[i] = null;
					} else {
						serverDocument.config.tags.list[i].isCommand = req.body["tag-" + i + "-isCommand"]=="command";
						serverDocument.config.tags.list[i].isLocked = req.body["tag-" + i + "-isLocked"]=="on";
					}
				}
				serverDocument.config.tags.list.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/commands/auto-translation").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/auto-translation", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-member"] && req.body["new-source_language"]) {
				var member = findQueryUser(req.body["new-member"], svr.members);
				if(member && !serverDocument.config.translated_messages.id(member.id)) {
					var enabled_channel_ids = [];
					svr.channels.forEach(ch => {
						if(ch.type==0) {
							if(req.body["new-enabled_channel_ids-" + ch.id]=="true") {
								enabled_channel_ids.push(ch.id);
							}
						}
					});
					serverDocument.config.translated_messages.push({
						_id: member.id,
						source_language: req.body["new-source_language"],
						enabled_channel_ids: enabled_channel_ids
					});
				}
			} else {
				for(var i=0; i<serverDocument.config.translated_messages.length; i++) {
					if(req.body["translated_messages-" + i + "-removed"]!=null) {
						serverDocument.config.translated_messages[i] = null;
					} else {
						serverDocument.config.translated_messages[i].enabled_channel_ids = [];
						svr.channels.forEach(ch => {
							if(ch.type==0) {
								if(req.body["translated_messages-" + i + "-enabled_channel_ids-" + ch.id]=="on") {
									serverDocument.config.translated_messages[i].enabled_channel_ids.push(ch.id);
								}
							}
						});
					}
				}
				serverDocument.config.translated_messages.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
		});
	});

	// Admin console trivia sets
	app.get("/dashboard/commands/trivia-sets", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.query.i) {
				var triviaSetDocument = serverDocument.config.trivia_sets[req.query.i];
				if(triviaSetDocument) {
					res.json(triviaSetDocument.items);
				} else {
					res.redirect("/error");
				}
			} else {
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
							trivia: {
								isEnabled: serverDocument.config.commands.trivia.isEnabled
							}
						}
					}
				});
			}
		});
	});
	io.of("/dashboard/commands/trivia-sets").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/trivia-sets", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-name"] && req.body["new-items"] && !serverDocument.config.trivia_sets.id(req.body["new-name"])) {
				serverDocument.config.trivia_sets.push({
					_id: req.body["new-name"],
					items: JSON.parse(req.body["new-items"])
				});
			} else {
				for(var i=0; i<serverDocument.config.trivia_sets.length; i++) {
					if(req.body["trivia_set-" + i + "-removed"]!=null) {
						serverDocument.config.trivia_sets[i] = null;
					}
				}
				serverDocument.config.trivia_sets.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/commands/api-keys").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/api-keys", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			serverDocument.config.custom_api_keys.google_api_key = req.body["google_api_key"];
			serverDocument.config.custom_api_keys.google_cse_id = req.body["google_cse_id"];

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/commands/tag-reaction").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/commands/tag-reaction", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-message"] && req.body["new-message"].length<=2000) {
				serverDocument.config.tag_reaction.messages.push(req.body["new-message"]);
			} else {
				serverDocument.config.tag_reaction.isEnabled = req.body["isEnabled"]=="on";
				for(var i=0; i<serverDocument.config.tag_reaction.messages.length; i++) {
					if(req.body["tag_reaction-" + i + "-removed"]!=null) {
						serverDocument.config.tag_reaction.messages[i] = null;
					}
				}
				serverDocument.config.tag_reaction.messages.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
					games: commands.public.games.description,
					messages: commands.public.messages.description,
					stats: commands.public.stats.description
				}
			});
		});
	});
	io.of("/dashboard/stats-points/stats-collection").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/stats-points/stats-collection", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			parseCommandOptions(svr, serverDocument, "stats", req.body);
			parseCommandOptions(svr, serverDocument, "games", req.body);
			parseCommandOptions(svr, serverDocument, "messages", req.body);

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
					ranks: commands.public.ranks.description
				}
			});
		});
	});
	io.of("/dashboard/stats-points/ranks").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/stats-points/ranks", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-name"] && req.body["new-max_score"] && !serverDocument.config.ranks_list.id(req.body["new-name"])) {
				serverDocument.config.ranks_list.push({
					_id: req.body["new-name"],
					max_score: req.body["new-max_score"],
					role_id: req.body["new-role_id"] || null
				});
			} else {
				for(var i=0; i<serverDocument.config.ranks_list.length; i++) {
					if(req.body["rank-" + i + "-removed"]!=null) {
						serverDocument.config.ranks_list[i] = null;
					} else {
						serverDocument.config.ranks_list[i].max_score = parseInt(req.body["rank-" + i + "-max_score"]);
						if(serverDocument.config.ranks_list[i].role_id || req.body["rank-" + i + "-role_id"]) {
							serverDocument.config.ranks_list[i].role_id = req.body["rank-" + i + "-role_id"];
						}
					}
				}
				if(req.body["ranks_list-reset"]!=null) {
					for(var i=0; i<serverDocument.members.length; i++) {
						if(serverDocument.members[i].rank && serverDocument.members[i].rank!=serverDocument.config.ranks_list[0]._id) {
							serverDocument.members[i].rank = serverDocument.config.ranks_list[0]._id;
						}
					}
				}
			}
			serverDocument.config.ranks_list.spliceNullElements();
			serverDocument.config.ranks_list = serverDocument.config.ranks_list.sort((a, b) => {
				return a.max_score - b.max_score;
			});

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
					points: commands.public.points.description
				}
			});
		});
	});
	io.of("/dashboard/stats-points/awesome-points").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/stats-points/awesome-points", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			parseCommandOptions(svr, serverDocument, "points", req.body);
			serverDocument.config.points_lottery = req.body["points_lottery"]=="on";

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/management/admins").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/admins", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-role_id"] && req.body["new-level"] && !serverDocument.config.admins.id(req.body["new-role_id"])) {
				serverDocument.config.admins.push({
					_id: req.body["new-role_id"],
					level: parseInt(req.body["new-level"])
				});
			} else {
				for(var i=0; i<serverDocument.config.admins.length; i++) {
					if(req.body["admin-" + i + "-removed"]!=null) {
						serverDocument.config.admins[i] = null;
					}
				}
				serverDocument.config.admins.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/management/moderation").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/moderation", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			serverDocument.config.moderation.isEnabled = req.body["isEnabled"]=="on";
			serverDocument.config.moderation.autokick_members.isEnabled = req.body["autokick_members-isEnabled"]=="on";
			serverDocument.config.moderation.autokick_members.max_inactivity = parseInt(req.body["autokick_members-max_inactivity"]);
			serverDocument.config.moderation.new_member_roles = [];
			svr.roles.forEach(role => {
				if(role.name!="@everyone" && role.name.indexOf("color-")!=0) {
					if(req.body["new_member_roles-" + role.id]=="on") {
						serverDocument.config.moderation.new_member_roles.push(role.id);
					}
				}
			});

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
					}).concat(config.global_blocklist.filter(usrid => {
						return svr.members.has(usrid);
					}).map(usrid => {
						var member = svr.members.get(usrid);
						return {
							name: member.user.username + " (global)",
							id: member.id,
							avatar: member.user.avatarURL || "/img/discord-icon.png"
						};
					})),
					moderation: {
						isEnabled: serverDocument.toObject().config.moderation.isEnabled
					}
				}
			});
		});
	});
	io.of("/dashboard/management/blocked").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/blocked", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-member"]) {
				var member = findQueryUser(req.body["new-member"], svr.members);
				if(member && serverDocument.config.blocked.indexOf(member.id)==-1 && bot.getUserBotAdmin(svr, serverDocument, member)==0) {
					serverDocument.config.blocked.push(member.id);
				}
			} else {
				for(var i=0; i<serverDocument.config.blocked.length; i++) {
					if(req.body["block-" + i + "-removed"]!=null) {
						serverDocument.config.blocked[i] = null;
					}
				}
				serverDocument.config.blocked.spliceNullElements();
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/management/muted").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/muted", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-member"] && req.body["new-channel_id"]) {
				var member = findQueryUser(req.body["new-member"], svr.members);
				var ch = svr.channels.get(req.body["new-channel_id"]);
				if(member && bot.getUserBotAdmin(svr, serverDocument, member)==0 && ch && !bot.isMuted(ch, member)) {
					bot.muteMember(ch, member, () => {
						res.redirect(req.originalUrl);
					});
				} else {
					res.redirect(req.originalUrl);
				}
			} else {
				svr.members.forEach(member => {
					svr.channels.forEach(ch => {
						if(ch.type==0) {
							if(bot.isMuted(ch, member) && (!req.body["muted-" + member.id + "-" + ch.id] || req.body["muted-" + member.id + "-removed"]!=null)) {
								bot.unmuteMember(ch, member);
							} else if(!bot.isMuted(ch, member) && req.body["muted-" + member.id + "-" + ch.id]=="on") {
								bot.muteMember(ch, member);
							}
						}
					});
				});
				res.redirect(req.originalUrl);
			}
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
									avatar: creator.user.avatarURL || "/img/discord-icon.png"
								},
								reason: md.makeHtml(strikeDocument.reason),
								rawDate: prettyDate(new Date(strikeDocument.timestamp)),
								relativeDate: Math.floor((Date.now() - strikeDocument.timestamp)/86400000)
							};
						})
					};
				})
			});
		});
	});
	io.of("/dashboard/management/strikes").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/strikes", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["new-member"] && req.body["new-reason"]) {
				var member = findQueryUser(req.body["new-member"], svr.members);
				if(member && bot.getUserBotAdmin(svr, serverDocument, member)==0) {
					var memberDocument = serverDocument.members.id(member.id);
					if(!memberDocument) {
						serverDocument.members.push({_id: member.id});
						memberDocument = serverDocument.members.id(member.id);
					}
					memberDocument.strikes.push({
						_id: consolemember.id,
						reason: req.body["new-reason"]
					});
				}
			} else {
				for(var key in req.body) {
					var args = key.split("-");
					if(args[0]=="strikes" && !isNaN(args[1]) && args[2]=="removeall") {
						var memberDocument = serverDocument.members.id(args[1]);
						if(memberDocument) {
							memberDocument.strikes = [];
						}
					}
				}
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
					avatar: member.user.avatarURL || "/img/discord-icon.png"
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
	io.of("/dashboard/management/status-messages").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/status-messages", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(Object.keys(req.body).length==1) {
				var args = Object.keys(req.body)[0].split("-");
				if(args[0]=="new" && serverDocument.config.moderation.status_messages[args[1]] && args[2]=="message") {
					if(args[1]=="member_streaming_message") {
						var member = findQueryUser(req.body[Object.keys(req.body)[0]], svr.members);
						if(member && serverDocument.config.moderation.status_messages[args[1]].enabled_user_ids.indexOf(member.id)==-1) {
							serverDocument.config.moderation.status_messages[args[1]].enabled_user_ids.push(member.id);
						}
					} else if(serverDocument.config.moderation.status_messages[args[1]].messages) {
						serverDocument.config.moderation.status_messages[args[1]].messages.push(req.body[Object.keys(req.body)[0]]);
					}
				}
			} else {
				for(var status_message in serverDocument.toObject().config.moderation.status_messages) {
					if(["new_member_pm", "member_removed_pm"].indexOf(status_message)==-1) {
						serverDocument.config.moderation.status_messages[status_message].channel_id = "";
					}
					for(var key in serverDocument.toObject().config.moderation.status_messages[status_message]) {
						switch(key) {
							case "isEnabled":
								serverDocument.config.moderation.status_messages[status_message][key] = req.body[status_message + "-" + key]=="on";
								break;
							case "enabled_channel_ids":
								if(["message_edited_message", "message_deleted_message"].indexOf(status_message)>-1 && req.body[status_message + "-type"]=="single") {
									break;
								}
								serverDocument.config.moderation.status_messages[status_message][key] = [];
								svr.channels.forEach(ch => {
									if(ch.type==0) {
										if(req.body[status_message + "-" + key + "-" + ch.id]!=null) {
											serverDocument.config.moderation.status_messages[status_message][key].push(ch.id);
										}
									}
								});
								break;
							case "channel_id":
								if(["message_edited_message", "message_deleted_message"].indexOf(status_message)>-1 && req.body[status_message + "-type"]=="msg") {
									break;
								}
							case "type":
								serverDocument.config.moderation.status_messages[status_message][key] = req.body[status_message + "-" + key];
								break;
						}
					}
					var key = status_message=="member_streaming_message" ? "enabled_user_ids" : "messages";
					if(serverDocument.config.moderation.status_messages[status_message][key]) {
						for(var i=0; i<serverDocument.config.moderation.status_messages[status_message][key].length; i++) {
							if(req.body[status_message + "-" + i + "-removed"]!=null) {
								serverDocument.config.moderation.status_messages[status_message][key][i] = null;
							}
						}
						serverDocument.config.moderation.status_messages[status_message][key].spliceNullElements();
					}
				}
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/management/filters").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/filters", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			for(var filter in serverDocument.toObject().config.moderation.filters) {
				for(var key in serverDocument.toObject().config.moderation.filters[filter]) {
					switch(key) {
						case "isEnabled":
						case "delete_messages":
						case "delete_message":
							serverDocument.config.moderation.filters[filter][key] = req.body[filter + "-" + key]=="on";
							break;
						case "disabled_channel_ids":
							serverDocument.config.moderation.filters[filter][key] = [];
							svr.channels.forEach(ch => {
								if(ch.type==0) {
									if(req.body[filter + "-" + key + "-" + ch.id]!="on") {
										serverDocument.config.moderation.filters[filter][key].push(ch.id);
									}
								}
							});
							break;
						case "keywords":
							serverDocument.config.moderation.filters[filter][key] = req.body[filter + "-" + key].split(",");
							break;
						default:
							serverDocument.config.moderation.filters[filter][key] = req.body[filter + "-" + key];
							break;
					}
				}
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/management/message-of-the-day").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/message-of-the-day", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			serverDocument.config.message_of_the_day.isEnabled = req.body["isEnabled"]=="on";
			serverDocument.config.message_of_the_day.message_content = req.body["message_content"];
			serverDocument.config.message_of_the_day.channel_id = req.body["channel_id"];
			serverDocument.config.message_of_the_day.interval = parseInt(req.body["interval"]);

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/management/voicetext-channels").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/voicetext-channels", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			serverDocument.config.voicetext_channels = [];
			svr.channels.forEach(ch=> {
				if(ch.type==2) {
					if(req.body["voicetext_channels-" + ch.id]=="on") {
						serverDocument.config.voicetext_channels.push(ch.id);
					}
				}
			});

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
					perms: commands.public.perms.description,
					role: commands.public.role.description,
					roleinfo: commands.public.roleinfo.description
				}
			});
		});
	});
	io.of("/dashboard/management/roles").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/management/roles", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			parseCommandOptions(svr, serverDocument, "roleinfo", req.body);
			parseCommandOptions(svr, serverDocument, "role", req.body);
			serverDocument.config.custom_colors = req.body["custom_colors"]=="on";
			serverDocument.config.custom_roles = [];
			svr.roles.forEach(role => {
				if(role.name!="@everyone" && role.name.indexOf("color-")!=0) {
					if(req.body["custom_roles-" + role.id]=="on") {
						serverDocument.config.custom_roles.push(role.id);
					}
				}
			});
			parseCommandOptions(svr, serverDocument, "perms", req.body);

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
						if(results[i].svrid && svr.id==results[i].svrid && (!req.query.q || results[i].message.toLowerCase().indexOf(req.query.q.toLowerCase())>-1) && (!req.query.chid || results[i].chid==req.query.chid)) {
							delete results[i].svrid;
							var ch = results[i].chid ? svr.channels.get(results[i].chid) : null;
							if(results[i].chid) {
								results[i].ch = ch ? ch.name : "invalid-channel";
							}
							var member = results[i].usrid ? svr.members.get(results[i].usrid) : null;
							if(results[i].usrid) {
								results[i].usr = member ? (member.user.username + "#" + member.user.discriminator) : "invalid-user";
							}
							switch(results[i].level) {
								case "warn":
									results[i].level = "exclamation";
									results[i].levelColor = "#ffdd57";
									break;
								case "error":
									results[i].level = "times";
									results[i].levelColor = "#ff3860";
									break;
								default:
									results[i].level = "info";
									results[i].levelColor = "#3273dc";
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
						channelData: getChannelData(svr),
						currentPage: req.path,
						logData: logs,
						searchQuery: req.query.q,
						channelQuery: req.query.chid
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
	io.of("/dashboard/management/name-display").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/other/name-display", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			serverDocument.config.name_display.use_nick = req.body["name_display-use_nick"]=="on";
			serverDocument.config.name_display.show_discriminator = req.body["name_display-show_discriminator"]=="on";

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/management/ongoing-activities").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/other/ongoing-activities", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(req.body["end-type"] && req.body["end-id"]) {
				var ch = svr.channels.get(req.body["end-id"]);
				if(ch) {
					var channelDocument = serverDocument.channels.id(ch.id);
					if(!channelDocument) {
						serverDocument.channels.push({_id: ch.id});
						channelDocument = serverDocument.channels.id(ch.id);
					}

					switch(req.body["end-type"]) {
						case "trivia":
							// TODO: end trivia session
							break;
						case "poll":
							// TODO: end poll
							break;
						case "giveaway":
							// TODO: end giveaway
							break;
						case "lottery":
							// TODO: end lottery
							break;
					}
				}
			}

			saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
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
	io.of("/dashboard/other/public-data").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/other/public-data", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			serverDocument.config.public_data.isShown = req.body["isShown"]=="on";
			var createInvite = false;
			if(!serverDocument.config.public_data.server_listing.isEnabled && req.body["server_listing-isEnabled"]=="on") {
				createInvite = true;
			}
			serverDocument.config.public_data.server_listing.isEnabled = req.body["server_listing-isEnabled"]=="on";
			serverDocument.config.public_data.server_listing.category = req.body["server_listing-category"];
			serverDocument.config.public_data.server_listing.description = req.body["server_listing-description"];
			if(createInvite) {
				svr.defaultChannel.createInvite({
					maxAge: 0,
					maxUses: 0
				}).then(invite => {
					if(invite) {
						serverDocument.config.public_data.server_listing.invite_link = "https://discord.gg/" + invite.code;
					}
					saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
				});
			} else if(serverDocument.config.public_data.server_listing.invite_link) {
				svr.defaultChannel.getInvites().then(invites => {
					if(invites) {
						var inviteToDelete = invites.find(invite => {
							return ("https://discord.gg/" + invite.code)==serverDocument.config.public_data.server_listing.invite_link;
						});
						if(inviteToDelete) {
							inviteToDelete.delete().then(() => {
								saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
							});
						} else {
							saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
						}
					}
				});
			} else {
				saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
			}
		});
	});

	// Admin console extensions
	app.get("/dashboard/other/extensions", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			var extensionData = serverDocument.toObject().extensions;
			extensionData.forEach(extensionDocument => {
				extensionDocument.store = sizeof(extensionDocument.store);
			});
			res.render("pages/admin-extensions.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				currentPage: req.path,
				configData: {
					extensions: extensionData
				}
			});
		});
	});
	io.of("/dashboard/other/extensions").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/other/extensions", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(Object.keys(req.body).length==1 && Object.keys(req.body)[0].indexOf("new-")==0) {
				var state = Object.keys(req.body)[0].split("-")[1];
				db.gallery.findOne({
					_id: req.body[Object.keys(req.body)[0]],
					state: state
				}, (err, galleryDocument) => {
					if(!err && galleryDocument) {
						var extensionDocument;
						var isUpdate = false;
						for(var i=0; i<serverDocument.extensions.length; i++) {
							if(serverDocument.extensions[i]._id.toString()==galleryDocument._id.toString()) {
								extensionDocument = serverDocument.extensions[i];
								isUpdate = true;
								break;
							}
						}

						extensionDocument = galleryDocument;
						extensionDocument.level = "third";
						extensionDocument.description = undefined;
						extensionDocument.points = undefined;
						extensionDocument.owner_id = undefined;
						extensionDocument.featured = undefined;
						extensionDocument.state = undefined;

						if(isUpdate) {
							io.of("/dashboard/other/extension-builder").emit("update", svr.id);
						} else {
							extensionDocument.enabled_channel_ids = [svr.defaultChannel.id];
							extensionDocument.store = {};
							serverDocument.extensions.push(extensionDocument);
						}

						try {
							writeFile(__dirname + "/../Extensions/" + svr.id + "-" + extensionDocument._id + ".abext", fs.readFileSync(__dirname + "/../Extensions/gallery-" + req.body[Object.keys(req.body)[0]] + ".abext"), err => {
								saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
							});
						} catch(err) {
							saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
						}
					} else {
						res.sendStatus(500);
					}
				});
			} else {
				for(var i=0; i<serverDocument.extensions.length; i++) {
					if(req.body["extension-" + i + "-removed"]!=null) {
						try {
							fs.unlinkSync(__dirname + "/../Extensions/" + svr.id + "-" + serverDocument.extensions[i]._id + ".abext");
						} catch(err) {}
						serverDocument.extensions[i] = null;
						break;
					}
				}
				serverDocument.extensions.spliceNullElements();

				saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
			}
		});
	});

	// Admin console extension builder
	app.get("/dashboard/other/extension-builder", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			var extensionData = {};
			if(req.query.extid) {
				extensionData = serverDocument.extensions.id(req.query.extid);
				if(!extensionData) {
					res.redirect("/error");
					return;
				} else {
					try {
						extensionData.code = fs.readFileSync(__dirname + "/../Extensions/" + svr.id + "-" + extensionData._id + ".abext");
					} catch(err) {
						extensionData.code = "";
					}
				}
			}
			res.render("pages/admin-extension-builder.ejs", {
				authUser: req.isAuthenticated() ? getAuthUser(req.user) : null,
				serverData: {
					name: svr.name,
					id: svr.id,
					icon: svr.iconURL || "/img/discord-icon.png"
				},
				channelData: getChannelData(svr),
				currentPage: req.path,
				extensionData: extensionData
			});
		});
	});
	io.of("/dashboard/other/extension-builder").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/other/extension-builder", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			if(validateExtensionData(req.body)) {
				var extensionDocument = {};
				var isUpdate = false;
				if(req.query.extid) {
					for(var i=0; i<serverDocument.extensions.length; i++) {
						if(serverDocument.extensions[i]._id==req.query.extid) {
							extensionDocument = serverDocument.extensions[i];
							isUpdate = true;
							break;
						}
					}
				}
				var enabled_channel_ids = [];
				svr.channels.forEach(ch => {
					if(ch.type==0) {
						if(req.body["enabled_channel_ids-" + ch.id]=="on") {
							enabled_channel_ids.push(ch.id);
						}
					}
				});
				extensionDocument.level = "third";
				extensionDocument.enabled_channel_ids = enabled_channel_ids;
				extensionDocument.admin_level = ["command", "keyword"].indexOf(req.body.type)>-1 ? (req.body.admin_level || 0) : null;
				extensionDocument = writeExtensionData(extensionDocument, req.body);

				if(!isUpdate) {
					serverDocument.extensions.push(extensionDocument);
					extensionDocument._id = serverDocument.extensions[serverDocument.extensions.length-1]._id;
					if(!req.query.extid) {
						req.originalUrl += "&extid=" + extensionDocument._id;
					}
					io.of("/dashboard/other/extensions").emit("update", svr.id);
				}

				writeFile(__dirname + "/../Extensions/" + svr.id + "-" + extensionDocument._id + ".abext", req.body.code, err => {
					saveAdminConsoleOptions(consolemember, svr, serverDocument, req, res);
				});
			} else {
				res.redirect("/error");
			}
		});
	});
	function validateExtensionData(data) {
		return ((data.type=="command" && data.key) || (data.type=="keyword" && data.keywords) || (data.type=="timer" && data.interval)) && data.code;
	}
	function writeExtensionData(extensionDocument, data) {
		extensionDocument.name = data.name;
		extensionDocument.type = data.type;
		extensionDocument.key = data.type=="command" ? data.key : null;
		extensionDocument.keywords = data.type=="keyword" ? data.keywords.split(",") : null;
		extensionDocument.case_sensitive = data.type=="keyword" ? data.case_sensitive=="on" : null;
		extensionDocument.interval = data.type=="timer" ? data.interval : null;
		extensionDocument.usage_help = data.type=="command" ? data.usage_help : null;
		extensionDocument.extended_help = data.type=="command" ? data.extended_help : null;
		extensionDocument.last_updated = Date.now();

		return extensionDocument;
	}

	// Admin console export configs
	app.get("/dashboard/other/export", (req, res) => {
		checkAuth(req, res, (consolemember, svr, serverDocument) => {
			res.json(serverDocument.toObject().config);
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
					roundedUptime: Math.floor(process.uptime()/3600),
					shardCount: bot.shards.size,
					version: config.version
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
						bot.leaveGuild(svr.id);
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
	app.post("/dashboard/servers/big-message", (req, res) => {
		checkAuth(req, res, consolemember => {
			if(req.body["message"]) {
				bot.guilds.forEach(svr => {
					svr.defaultChannel.createMessage(req.body["message"]);
				});
			}
			res.redirect(req.originalUrl);
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
	io.of("/dashboard/global-options/blocklist").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/global-options/blocklist", (req, res) => {
		checkAuth(req, res, consolemember => {
			if(req.body["new-user"]) {
				var usr = findQueryUser(req.body["new-user"], bot.users);
				if(usr && config.global_blocklist.indexOf(usr.id)==-1 && config.maintainers.indexOf(usr.id)==-1) {
					config.global_blocklist.push(usr.id);
				}
			} else {
				for(var i=0; i<config.global_blocklist.length; i++) {
					if(req.body["block-" + i + "-removed"]!=null) {
						config.global_blocklist[i] = null;
					}
				}
				config.global_blocklist.spliceNullElements();
			}

			saveMaintainerConsoleOptions(consolemember, req, res);
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
	io.of("/dashboard/global-options/bot-user").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/global-options/bot-user", (req, res) => {
		checkAuth(req, res, consolemember => {
			if(req.body["avatar"]) {
				base64.encode(req.body["avatar"], {
					string: true
				}, (err, data) => {
					updateBotUser(data);
				});
			} else {
				updateBotUser();
			}
			function updateBotUser(avatar) {
				bot.editSelf({
					avatar: avatar ? ("data:image/jpeg;base64," + avatar) : null,
					username: req.body["username"]!=bot.user.username ? req.body["username"] : null
				}).then(() => {
					var game = {
						name: req.body["game"]
					};
					config.game = req.body["game"];
					if(req.body["game"]=="awesomebot.xyz" || req.body["game-default"]!=null) {
						config.game = "default";
						game = {
							name: "awesomebot.xyz",
							url: "http://awesomebot.xyz"
						};
					}
					bot.editStatus(req.body["status"], game);
					saveMaintainerConsoleOptions(consolemember, req, res);
				});
			}
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
					header_image: config.header_image,
					homepage_message_html: config.homepage_message_html
				},
				dirname: __dirname
			});
		});
	});
	io.of("/dashboard/global-options/homepage").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/global-options/homepage", (req, res) => {
		checkAuth(req, res, consolemember => {
			config.homepage_message_html = req.body["homepage_message_html"];
			config.header_image = req.body["header_image"];

			saveMaintainerConsoleOptions(consolemember, req, res);
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
					})
				},
				showRemove: consolemember.id=="115165640670576644"
			});
		});
	});
	io.of("/dashboard/global-options/maintainers").on("connection", socket => {
		socket.on('disconnect', () => {});
	});
	app.post("/dashboard/global-options/maintainers", (req, res) => {
		checkAuth(req, res, consolemember => {
			if(req.body["new-user"]) {
				var usr = findQueryUser(req.body["new-user"], bot.users);
				if(usr && config.maintainers.indexOf(usr.id)==-1) {
					config.maintainers.push(usr.id);
				}
			} else {
				if(consolemember.id=="115165640670576644") {
					for(var i=0; i<config.maintainers.length; i++) {
						if(req.body["maintainer-" + i + "-removed"]!=null) {
							config.maintainers[i] = null;
						}
					}
					config.maintainers.spliceNullElements();
				}
			}

			saveMaintainerConsoleOptions(consolemember, req, res);
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

	// Error page
	app.get("/error", (req, res) => {
		res.render("pages/error.ejs");
	})
};

function findQueryUser(query, list) {
	query = query.replaceAll("#", "----");
	var usr = list.get(query);
	if(!usr) {
		var usernameQuery = query.substring(0, query.lastIndexOf("----")>-1 ? query.lastIndexOf("----") : query.length);
		var discriminatorQuery = query.indexOf("----")>-1 ? query.substring(query.lastIndexOf("----")+4) : "";
		var usrs = list.filter(a => {
			return (a.user || a).username==usernameQuery;
		});
		if(discriminatorQuery) { 
			usr = usrs.find(a => {
				return (a.user || a).discriminator==discriminatorQuery;
			});
		} else if(usrs.length>0) {
			usr = usrs[0];
		}
	}
	return usr;
}

function parseCommandOptions(svr, serverDocument, command, data) {
	serverDocument.config.commands[command].isEnabled = data[command + "-isEnabled"]=="on";
	serverDocument.config.commands[command].admin_level = data[command + "-admin_level"] || 0;
	serverDocument.config.commands[command].disabled_channel_ids = [];
	svr.channels.forEach(ch => {
		if(ch.type==0) {
			if(data[command + "-disabled_channel_ids-" + ch.id]==null) {
				serverDocument.config.commands[command].disabled_channel_ids.push(ch.id);
			}
		}
	});
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

Object.assign(Array.prototype, {
	spliceNullElements() {
		for(var i=0; i<this.length; i++) {
			if(this[i]==null) {
				this.splice(i, 1);
				i--;
			}
		}
	}
});