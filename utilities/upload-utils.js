var file = require('./file-utils'),
    projections = require('./projection-utils'),
    parse = require('csv-parse'),
    transform = require('stream-transform'),
    aws = require('aws-sdk'),
    _ = require ('underscore'),
    _str = require('underscore.string');

var db = new aws.DynamoDB({ region: 'us-east-1' });

function createParser(filename) {
    var parser = parse({ columns: true });

    parser.on('end', function() {
        console.log('successfully parsed ' + filename);
    });

    parser.on('error', function(err) {
        console.log('error parsing ' + filename + " -- " + err);
    });
            
    return parser;
}

function createUpdateTransformer(table, site, callback) {
    var requests = [];

    var transformer = transform(function(data) {
        requests.push(createUpdatePositionParams(table, data, site));
    });

    transformer.on('finish', function() {
        console.log('created ' + requests.length + ' Dynamo requests');
        callback(null, requests);
    });

    transformer.on('error', function(err) {
        console.log('error transforming:' + err);
        callback(err);
    });
            
    return transformer;
}

function createDynamoTransfomer(table, site, callback) {
    var requests = { 
        initRequests: [], // see 'createNewPlayerParams()'
        dataRequests: []
    };

    var transformer = transform(function(data) {
        requests.initRequests.push(createNewPlayerParams(table, data));
        requests.dataRequests.push(createUpdateProjectionParams(table, data, site));
    });

    transformer.on('finish', function() {
        console.log('created ' + requests.dataRequests.length + ' Dynamo requests');
        callback(null, requests);
    });

    transformer.on('error', function(err) {
        console.log('error transforming:' + err);
        callback(err);
    });
            
    return transformer;
}

var NO_WRITE = "ConditionalCheckFailedException";
var CATEGORIES = projections.getCategories();

var createNewPlayerParams = function(table, playerData) {
    // an item needs to exist before it can be updated with new attributes

    return {
        TableName: table,
        Item: {
            player_id: { S: playerData.player_id }
        },
        ConditionExpression: 'attribute_not_exists (player_id)' // only create a new, empty item if one doesn't exist
    };
};

var createRemoveParams = function(table, playerData) {
    var params = {
        TableName: table,
        Key: {
            player_id: playerData.player_id
        },
        ExpressionAttributeNames: {
            "#proj": "projections"
        },
        UpdateExpression: 'REMOVE #proj',
    };

    return params;
};

var createUpdatePositionParams = function(table, playerData, site) {
    return {
        TableName: table,
        Key: {
            player_id: { S: playerData.player_id }
        },
        ExpressionAttributeValues: {
            ":positions": { SS: [playerData.positions] }
        },
        ExpressionAttributeNames: {
            "#pos": "positions"
        },
        UpdateExpression: 'SET #pos.' + site + ' = :positions',
    };
};

var createUpdateProjectionParams = function(table, playerData, site) {
    var projectionMap = { 
        M: { } 
    };

    for (var stat in playerData) {
        if (_.contains(CATEGORIES, stat)) {
            projectionMap.M[stat] = { N: playerData[stat] };
        }
    }  

    return {
        TableName: table,
        Key: {
            player_id: { S: playerData.player_id }
        },
        ExpressionAttributeValues: {
            ":projection": projectionMap
        },
        ExpressionAttributeNames: {
            "#proj": site
        },
        UpdateExpression: 'SET #proj = :projection',
    };
};

var writeToDB = function(request, callback) {
    // console.log("sending put request for: " + request.Item.player_id.S);

    db.putItem(request, function(err, data) {
        var playerId = request.Item.player_id.S;

        if (err && (err.code !== NO_WRITE)) {
            // this code means a conditional check failed, 
            // which just means it wasn't necessary to write the data
            errors.push({ cause: err, playerId: playerId })
        } else {
            if (!err) {
                console.log("adding item: " + playerId);
            }
            callback(null, playerId);
        }
    });
};

var updateDB = function(request, callback) {
    // console.log("sending update request for: " + request.Key.player_id.S);

    db.updateItem(request, function(err, data) {
        var playerId = request.Key.player_id.S;

        if (err && (err.code !== NO_WRITE)) {
            // this code means a conditional check failed, 
            // which just means it wasn't necessary to write the data
            callback({ cause: err, playerId: playerId });
        } else {
            if (!err) {
                console.log("     =======> adding data: " + playerId);
            }

            callback(null, playerId);
        }
    });
};

function writeDataToDB(table, requests, callback, update) {
    // data will be an array of player objects

    // check throughput of the table so we don't exceed it when batching
    db.describeTable({ TableName: table }, function(err, data) {
        if (err) {
            console.log("error: " + err);
            return;
        }

        // each 'request' is made of up 2 separate DB writes
        var writeThroughput = data.Table.ProvisionedThroughput.WriteCapacityUnits;
        if (writeThroughput > 0) {
            var errors = [];
            var numWritten = 0,
                batchSize = 0,
                startIndex = 0,
                numRequests = requests.length;

            // create callback function
            var processed = _.after(numRequests, function() {
                callback((errors.length > 0 ? { errors: errors } : null), { count: numWritten });
            });                        

            while (startIndex < numRequests) {
                // batch the requests so as not to exceed the write throughput, write one batch every second or so
                var batchSize = Math.min(writeThroughput, numRequests - startIndex);

                var writeItems = _.bind(function() {
                    this.requests.slice(this.startIndex, this.startIndex + this.batchSize).forEach(function(request, index) {
                        (update ? updateDB : writeToDB).call(this, request, function(err, data) {
                            if (err) {
                                errors.push(err);
                            } else {
                                numWritten++;
                            }

                            processed();
                        });
                    });
                }, { startIndex: startIndex, batchSize: batchSize, requests: requests });

                _.delay(writeItems, (Math.floor(startIndex / batchSize)) * 1100);

                startIndex += batchSize;
            }
        } else {
            console.log("couldn't determine write throughput!");
            return;
        }
    });
}

function handleDBErrors(errors) {
    errors.forEach(function(error) {
        console.error("failed to write data for " + error.playerId + ": " + error.cause);
    });
}

// this will create/update items in the players table
var uploadPlayerData = function(fileName, site) {
    var table = "players";

    var stream = file.openCSV(fileName);
    var parser = createParser(fileName);
    var transformer = createUpdateTransformer(table, site, function (err, requests) {
        if (requests) {
            writeDataToDB(table, requests, function(err, data) {
                if (!err) {
                    console.log(" ==== all player data written!");
                } else {
                    console.log(" === wrote " + data.count + " items, with errors");
                    handleDBErrors(err.errors);
                }
            }, true);
        }
    });

    stream.pipe(parser).pipe(transformer);
};

// this will update the projections attribute of items in the players table
var uploadProjectionData = function(fileName, site) {
    var table = "projections";

    var stream = file.openCSV(fileName);
    var parser = createParser(fileName);
    var transformer = createDynamoTransfomer(table, site, function (err, data) {
        if (data) {
            // this will return two arrays, one of "init" requests needed to set up the DB, and
            // one of "data" requests to upload data
            var initRequests = data.initRequests;
            var dataRequests = data.dataRequests;

            writeDataToDB(table, initRequests, function(err, initData) {
                if (!err) {
                    console.log("initialized projection map for " + initData.count + " players, now uploading data")
                    writeDataToDB(table, dataRequests, function(err, requestData) {
                        if (!err) {
                            console.log(" ==== all player data written!");
                        } else {
                            console.log(" === wrote " + requestData.count + " items, with errors");
                            handleDBErrors(err.errors);
                        }
                    }, true);
                } else {
                    handleDBErrors(err.errors);
                }
            });
        }
    });

    stream.pipe(parser).pipe(transformer);
};

exports.playerData = uploadPlayerData;
exports.projectionData = uploadProjectionData;


