const auth = require("./../Configuration/auth.json");

// Search for an image via Google Custom Search
module.exports = (serverDocument, query, safe, num, callback) => {
	if(callback) {
		num = "&start=" + num;
	} else {
		callback = num;
		num = "";
	}

    unirest.get("https://www.googleapis.com/customsearch/v1?key=" + (serverDocument.config.custom_api_keys.google_api_key || auth.tokens.google_api_key) + "&cx=" + (serverDocument.config.custom_api_keys.google_cse_id || auth.tokens.google_cse_id) + (safe ? "&safe=high" : "") + "&q=" + encodeURI(query.replaceAll("&", "")) + "&alt=json&searchType=image" + num).header("Accept", "application/json").end(res => {
        if(!res.body || !res.body.items || res.body.items.length==0) {
            callback();
        } else if(res.body.error) {
            if(res.body.error.code==403) {
                callback(403);
            } else {
                callback()
            }
        } else {
            callback(res.body.items[0].link);
        }
    });
};