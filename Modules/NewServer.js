// Set defaults for new server document
module.exports = (bot, svr, serverDocument) => {
	// Default admin roles
	var rolesOfOwner = svr.members.get(svr.ownerID).roles.sort((a, b) => {
		return svr.roles.get(a).position - svr.roles.get(b).position;
	});
	if(rolesOfOwner[0] && svr.roles.get(rolesOfOwner[0]).name!="@everyone") {
		serverDocument.config.admins.push({
			_id: rolesOfOwner[0],
			level: 3
		});
	}
	svr.roles.forEach(role => {
		if(role.name!="@everyone" && role.permissions.has("manageGuild") && !serverDocument.config.admins.id(role.id)) {
			serverDocument.config.admins.push({
				_id: role.id,
				level: 3
			});
		}
	});

	// Default RSS feed
	serverDocument.config.rss_feeds.push({
		_id: "gnews",
		url: "https://news.google.com/news?ned=us&topic=h&output=rss"
	});

	// Default tag list
	serverDocument.config.tags.list.push({
	    _id: "shrug",
	    content: "¯\\\_(ツ)_/¯"
	}, {
	    _id: "lenny",
	    content: "( ͡° ͜ʖ ͡°)"
	}, {
	    _id: "raiseyourdongers",
	    content: "ヽ༼ຈل͜ຈ༽ﾉ Raise Your Dongers ヽ༼ຈل͜ຈ༽ﾉ"
	}, {
	    _id: "praisehelix",
	    content: "つ ◕_◕ ༽つ PRAISE HELIX༼つ ◕_◕ ༽つ"
	}, {
	    _id: "goodshit",
	    content: "👌👀👌👀👌👀👌👀👌👀 good shit go౦ԁ sHit👌 thats ✔ some good👌👌shit right👌👌there👌👌👌 right✔there ✔✔if i do ƽaү so my self 💯 i say so 💯 thats what im talking about right there right there (chorus: ʳᶦᵍʰᵗ ᵗʰᵉʳᵉ) mMMMMᎷМ💯 👌👌 👌НO0ОଠOOOOOОଠଠOoooᵒᵒᵒᵒᵒᵒᵒᵒᵒ👌 👌👌 👌 💯 👌 👀 👀 👀 👌👌Good shit"
	}, {
	    _id: "creepylenny",
	    content: "┬┴┬┴┤ ͜ʖ ͡°) ├┬┴┬┴"
	}, {
	    _id: "kawaii",
	    content: "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧"
	}, {
	    _id: "yeeaah",
	    content: "(•_•) ( •_•)>⌐■-■ (⌐■_■)"
	}, {
	    _id: "lod",
	    content: "ಠ_ಠ"
	}, {
	    _id: "orly",
	    content: "﴾͡๏̯͡๏﴿ O'RLY?"
	}, {
	    _id: "ayy",
	    content: "(☞ﾟ∀ﾟ)☞"
	}, {
	    _id: "gib",
	    content: "༼ つ ◕_◕ ༽つ"
	}, {
	    _id: "kawaiidog",
	    content: "(ᵔᴥᵔ)"
	}, {
	    _id: "fite",
	    content: "(ง'̀-'́)ง"
	}, {
	    _id: "kawaiimeh",
	    content: " ╮ (. ❛ ᴗ ❛.) ╭"
	}, {
	    _id: "evilsmiley",
	    content: "“ψ(｀∇´)ψ"
	}, {
	    _id: "rip",
	    content: "(✖╭╮✖)"
	}, {
	    _id: "wink",
	    content: "ಠ‿↼"
	});

	// Default ranks list
	serverDocument.config.ranks_list.push({
        _id: "Pro Lurker",
        max_score: 5
    },
    {
        _id: "Learning Lurker",
        max_score: 10
    },
    {
        _id: "Bad Lurker",
        max_score: 20
    },
    {
        _id: "Mostly Inactive",
        max_score: 40
    },
    {
        _id: "In Between",
        max_score: 75
    },
    {
        _id: "Kinda Active",
        max_score: 100
    },
    {
        _id: "Pretty Active",
        max_score: 200
    },
    {
        _id: "Super Active",
        max_score: 400
    },
    {
        _id: "Pro Member",
        max_score: 750
    },
    {
        _id: "Almost a Spammer",
        max_score: 1000
    });

	// Default member messages
	serverDocument.config.moderation.status_messages.new_member_message.messages.push("@user Welcome to our little corner of hell!", "@user has joined the server.", "@user You're gonna have a jolly good time here!", "@user is new here.", "@user is here, everybody!", "@user sends his/her regards.", "@user, welcome to the server!", "@user is our next victim...", "Hello @user!", "Please welcome our newest member, @user");
	serverDocument.config.moderation.status_messages.member_online_message.messages.push("@user is now online!", "Welcome back @user!");
	serverDocument.config.moderation.status_messages.member_offline_message.messages.push("@user is gone (for now)", "@user has gone offline.");
	serverDocument.config.moderation.status_messages.member_removed_message.messages.push("@user has left us :slight_frown:", "Goodbye @user", "@user Come back!", "@user is gone *cries*", "@user has left the server", "RIP @user", "Uh-oh, @user went away", "Please convince @user to come back!");
	serverDocument.config.moderation.status_messages.member_banned_message.messages.push("@user has been banned");
	serverDocument.config.moderation.status_messages.member_unbanned_message.messages.push("@user has been unbanned");

	// Default tag reactions
	serverDocument.config.tag_reaction.messages.push("@user you called?", "Yo @user wassup");

	// Send message to server owner about AwesomeBot
	// TODO: uncomment this after testing
	//bot.messageBotAdmins(svr, serverDocument, "Hello! " + bot.user.username + " (that's me) has been added to " + svr.name + ", a server you moderate! " + (bot.guilds.size % 1000==0 ? ("*Wow, you're server #" + bot.guilds.size + " for me!* ") : "") + "Use `" + bot.getCommandPrefix(svr, serverDocument) + "help` to learn more or check out https://awesomebot.xyz/ :slight_smile: :tada:");

	return serverDocument;
};
