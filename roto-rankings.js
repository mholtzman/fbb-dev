var file = require('fs'),
    request = require('request'),
    Q = require('q'),
    open = require('open'),
    cheerio = require('cheerio'),
    _ = require('underscore');

function Team(name) {
    this.name = name;

    this.r = 0;
    this.rbi = 0;
    this.hr = 0;
    this.sb = 0;
    this.avg = 0;
    this.ops = 0;

    this.k = 0;
    this.w = 0;
    this.l = 0;
    this.sv = 0;
    this.era = 0;
    this.whip = 0;

    this.total = 0;
}

var loginToESPN = function(username, password) {
    var loginUrl = "https://r.espn.go.com/espn/memberservices/pc/login";

    var formData = {
        failedAttempts: 0,
        SUBMIT: 1,
        cookieDomain: '.go.com',
        username: username,
        password: password,
        submit: 'Sign In'
    };

    var options = {
        url: loginUrl,
        followAllRedirects: true,
        jar: true,
        form: formData
    };

    request.post(options, function(err, response, body) {
        if (err) {
            console.error("error: " + err);
        } else {
            console.log("status: " + response.statusCode);
            //file.writeFileSync("C:\\dev\\output.html", body);
            //open('file:///C:\\dev\\output.html');

            openLeaguePage();
        }
    });
};

loginToESPN(process.argv[2], process.argv[3]);

var openLeaguePage = function() {
    var leagueUrl = "http://games.espn.go.com/flb/standings?leagueId=128598&seasonId=2015";
    var options = {
        url: leagueUrl,
        jar: true
    };

    request.get(options, function(err, response, body) {
        if (err) {
            console.error("error: " + err);
        } else {
            console.log("status: " + response.statusCode + "\n\n");

            processStandings(body);
        }
    })
    /*var pageIndex = 0;

    var maxPlayers = (pitchers ? 300 : 400);
    var playersPerPage = 15; // for ESPN, we need to scrape 15 players at a time

    var outputStream = file.writeCSV(outputFile);
    if (outputStream) {
        var requests = [];
        var parser = new parsers.ESPNParser(pitchers ? positions.PitcherSelector : positions.BatterSelector);

        // first call will include the categories, the rest will just be stats
        while (pageIndex < maxPlayers) {
            requests.push(scrapeHTML(baseUrl + pageIndex, parser, pageIndex === 0));

            pageIndex += playersPerPage;
        }

        Q.all(requests).then(function(allData) {
            console.log("all requests done, writing file!");

            var parser = parse({ columns: true });

            var downloadStringer = stringify(),
                outputStringer = stringify({ header: true });

            downloadStringer.pipe(parser).pipe(normalizer).pipe(outputStringer).pipe(outputStream);

            allData.forEach(function(requestData) {
                requestData.forEach(function(row) {
                    downloadStringer.write(row);
                });
            });

            stringer.end();
        });
    }*/
};

function processStandings(html) {
    var $ = cheerio.load(html);

    var categories = [], teams = [];
    var categoryRow = $('#statsTable .tableSubHead').last();
    categoryRow.find('td a.hand').each(function() {
        categories.push($(this).text().toLowerCase());
    });

    var userRows = $('#statsTable').find('.sortableRow');

    userRows.each(function() {
        var team = new Team($(this).find('.sortableTeamName a').first().text());
        var stats = $(this).children('.precise');

        for (var i = 0; i < categories.length; i++) {
            team[categories[i]] = Number(stats.eq(i).text());
        }

        teams.push(team);
    });

    // sort and calculate totals
    categories.forEach(function(category) {
        var sortedList = _.sortBy(teams, category);
        for (var i = 0; i < 12; i++) {
            if (category === 'l' || category === 'era' || category === 'whip') {
                sortedList[11 - i].total += (i + 1);
            } else {
                sortedList[i].total += (i + 1);
            }
        }
    });

    var standings = _.sortBy(teams, 'total');
    for (var i = standings.length - 1; i >= 0; i--) {
        console.log(standings[i].name + ": " + standings[i].total);
    }


    /*this.parse = function($, includeCategories) {
        var parsedData = [];
        var positionSelector = this.positionSelector;

        var matchedPlayers = $('div.games-fullcol table').not(function() {
            var playerData = $(this).find('.subheadPlayerNameLink').text();
            var positions = _str.strRightBack(_str.replaceAll(playerData, ", ", ","), " ");
            return !positionSelector.matches(positions);
        });

        if (includeCategories) {
            var categories = ['player_id','first_name','last_name','team','positions'];

            // scrape the categories
            matchedPlayers.first().find('tr.tableSubHead td.playertableStat').each(function() {
                categories.push($(this).text().toLowerCase());
            });

            parsedData.push(categories);
        }

        matchedPlayers.each(function() {
            var player = [];

            // first scrape player name, team, position
            var playerData = $(this).find('.subheadPlayerNameLink').text();

            // remove ranking info
            var playerInfo = _str.words(_str.replaceAll(_str.strRight(playerData, ". "), ",", ""));
            var firstName = playerInfo[0];
            var lastName = playerInfo[1];

            player.push(utils.getPlayerId(firstName, lastName));
            player.push(firstName);
            player.push(lastName);
            player.push(playerInfo[2].toUpperCase()); // team
            player.push(positions.normalize(_.rest(playerInfo, 3).join(","))); // positions

            // then scrape stats
            var stats = $(this).find('tr.tableBody').last().find('td.playertableStat').each(function() {
                player.push($(this).text());
            });

            parsedData.push(player);
        });

        return parsedData;
    }*/
}