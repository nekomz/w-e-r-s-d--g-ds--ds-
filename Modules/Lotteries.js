var multiplier = 1;
module.exports = {
	multiplier: multiplier,
	start: (db, svr, serverDocument, usr, ch, channelDocument) => {
		if(!channelDocument.lottery.isOngoing) {
			channelDocument.lottery.isOngoing = true;
			channelDocument.lottery.expiry_timestamp = Date.now() + 3600000;
			channelDocument.lottery.creator_id = usr.id;
			channelDocument.lottery.participant_ids = [];
			serverDocument.save(err => {
				multiplier += 0.5;
				setTimeout(() => {
					module.exports.end(db, svr, serverDocument, ch, channelDocument);
				}, 3600000);
			});
		}
	},
	end: (db, svr, serverDocument, ch, channelDocument) => {
		if(channelDocument.lottery.isOngoing) {
			channelDocument.lottery.isOngoing = false;
			var winner;
			while(!winner && channelDocument.lottery.participant_ids.length>1) {
				var i = Math.floor(Math.random() * channelDocument.lottery.participant_ids.length);
				var member = svr.members.get(channelDocument.lottery.participant_ids[i]);
				if(member) {
					winner = member;
				} else {
					channelDocument.lottery.participant_ids.splice(i, 1);
				}
			}
			serverDocument.save(err => {
				if(winner) {
					var prize = Math.ceil(channelDocument.lottery.participant_ids.length * multiplier);
					db.users.findOrCreate({_id: winner.id}, (err, userDocument) => {
						if(!err && userDocument) {
							userDocument.points += prize;
						}
						var participantCount = channelDocument.lottery.participant_ids.filter((elem, i, self) => {
						    return i==self.indexOf(elem);
						}).length;
						ch.createMessage("Congratulations " + winner.mention + "! 🎊 You won the lottery for **" + prize + "** AwesomePoints out of " + participantCount + " participant" + (participantCount==1 ? "" : "s") + ". Enjoy the cash 💰");
					});
				}
			});
			return winner;
		}
	}
}