var file = require('fs'),
    request = require('request'),
    Q = require('q'),
    open = require('open');

var loginToESPN = function() {
    var loginUrl = "https://r.espn.go.com/espn/memberservices/pc/login";
    var username = "foxxxer";
    var password = "x316F4zmFlTq";

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

loginToESPN();

var openLeaguePage = function(outputFile, pitchers) {
    var leagueUrl = "http://games.espn.go.com/flb/standings?leagueId=128598&seasonId=2015";
    var options = {
        url: leagueUrl,
        jar: true
    };

    request.get(options, function(err, response, body) {
        if (err) {
            console.error("error: " + err);
        } else {
            console.log("status: " + response.statusCode + "\n\n" + JSON.stringify(body));
            //file.writeFileSync("C:\\dev\\output.html", body);
            //open('file:///C:\\dev\\output.html');

            //openLeaguePage();
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