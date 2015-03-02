var STAT_CATEGORIES = ["pa", "ab", "h", "2b", "3b", "r", "rbi", "hr", "bb", "k", "sb", "cs", "hbp", "avg", "slg", "obp", "ops"];
var HBP_CONSTANT = (1/100), // if no HBP, assume one every 100 ABs
    CS_CONSTANT = (1/3); // if no CS, assume 75% success rate of SB

exports.normalizeStats = function(playerData) {
    playerData.hbp = playerData.hbp || Math.floor(playerData.ab * HBP_CONSTANT);
    playerData.cs = playerData.cs || Math.floor(playerData.sb * CS_CONSTANT);

    // back out PA from AB + BB + random constant when HBP and SACs are missing
    playerData.pa = playerData.pa || Math.floor(Number(playerData.ab) + Number(playerData.bb) + Number(playerData.hbp));

    // back out H from AB * AVG
    playerData.h = playerData.h || Math.floor(Number(playerData.ab) * Number(playerData.avg));

    playerData['2b'] = playerData['2b'] || 0;
    playerData['3b'] = playerData['3b'] || 0;
    
    // some sites use 'so' or 'ko' for strikeouts
    playerData.k = playerData.k || playerData.so || playerData.ko;
    delete playerData["so"];
    delete playerData["ko"];

    // some sites use 'ba' for batting average
    playerData.avg = playerData.avg || playerData.ba;
    delete playerData["ba"];
};

exports.getCategories = function() {
    return STAT_CATEGORIES;
}

