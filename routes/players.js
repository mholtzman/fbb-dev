var aws = require('aws-sdk'),
    express = require('express');

var credentials = new aws.SharedIniFileCredentials({profile: 'ffb'});
aws.config.credentials = credentials;
aws.config.update({ region: 'us-east-1' });

var router = express.Router();

router.get('/', function(req, resp) {
    var scanParams = {
        TableName: 'players'
    };

    var db = new aws.DynamoDB();

    db.scan(scanParams, function(err, data) {
        if (err) resp.send(err);
        else resp.render('index', { players: data.Items });
    });
});

router.get('/get_total', function(req, resp) {
    var scanParams = {
        TableName: 'players'
    };

    var db = new aws.DynamoDB();

    db.scan(scanParams, function(err, data) {
        if (err) resp.end(err);
        else resp.json({ "players": data.Count });
    });
});

module.exports = router;