// A shard receives the ready packet
module.exports = (bot, db, config, winston, id) => {
	winston.info("Shard " + (id + 1) + "/" + bot.shards.size + " connected");
};