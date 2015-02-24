var _str = require('underscore.string');

// convert to lowercase, remove all periods, then capitalize (for later converting to underscores)
function normalize_id(str) {
    return _str.replaceAll(_str.replaceAll(_str.capitalize(str.toLowerCase()), "\\.", ""), "\\'", "");
}

var getPlayerId = function(firstName, lastName) {
    return _str.underscored(normalize_id(firstName) + (lastName ? normalize_id(lastName) : ""));
};

//exports.uploadProjections = upload;
exports.getPlayerId = getPlayerId;