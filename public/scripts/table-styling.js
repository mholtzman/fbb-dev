var noDecimals = function(data) {
    var num = Number(data);
    return isNaN(num) ? "" : num.toFixed(0);
}

var threeDecimals = function(data) {
    var num = Number(data);
    return isNaN(num) ? "" : num.toFixed(3);
}

var ops = function(row) {
    var projection = row.projection;

    if (projection) {
        var obp = projection.obp;
        var slg = projection.slg;

        if (obp && slg) {
            return Number(row.projection.obp) + Number(row.projection.slg);
        }
    }

    return "";
};
var positions = function(row) {
    var positions = row.positions;

    if (positions) {
        var pos = positions.espn;
        if (!pos) {
            pos = positions.cbs;
            if (!pos) {
                pos = positions.zips;
            }
        }

        return pos;
    }

    return "";
};

var INITIAL_SORT = "ops";
var DATA_URL = "/projections";

function getRequestedSites(data) {
    var checkedSites = []

    $(".proj-filter:checked").each(function() {
        checkedSites.push($(this).val().toLowerCase());
    });

    data.site = checkedSites;
}

$(document).ready(function() {
    var columns = [
            { name: "name", title: "Name", data: "name", searchable: true, orderable: false },
            { name: "team", title: "Team", data: "team", searchable: true, orderable: false },
            { name: "positions", title: "Positions", data: positions, searchable: true, orderable: false },
            { name: "plate_appearances", title: "PA", data: "projection.pa", render: noDecimals },
            { name: "at_bats", title: "AB", data: "projection.ab", render: noDecimals },
            { name: "hits", title: "H", data: "projection.h", render: noDecimals },
            { name: "runs", title: "R", data: "projection.r", render: noDecimals },
            { name: "rbi", title: "RBI", data: "projection.rbi", render: noDecimals },
            { name: "home_runs", title: "HR", data: "projection.hr", render: noDecimals },
            { name: "stolen_bases", title: "SB", data: "projection.sb", render: noDecimals },
            { name: "caught_stealing", title: "CS", data: "projection.cs", render: noDecimals },    
            { name: "strikeouts", title: "K", data: "projection.k", render: noDecimals },
            { name: "batting_average", title: "AVG", data: "projection.avg", render: threeDecimals },
            { name: "on_base_pct", title: "OBP", data: "projection.obp", render: threeDecimals },
            { name: "slugging_pct", title: "SLG", data: "projection.slg", render: threeDecimals },
            { name: "ops", title: "OPS", data: ops, render: threeDecimals }
        ];

    var table = $('#players-table').DataTable({
        ajax: {
            url: DATA_URL,
            data: getRequestedSites
        },
        info: false,
        pageLength: 25,
        pagingType: 'simple',
        lengthMenu: [ 25, 50, 100 ],
        order: [ [_.findIndex(columns, function(col) { return col.name === INITIAL_SORT }), 'desc' ] ],
        columns: columns,
        columnDefs: [
            { targets: '_all', orderSequence: ['desc'], searchable: false }
        ]
    });

    initPositionSorters(table);
    initLeagueFilter(table);
    initProjectionFilters(table);

    var searchBox = $('#players-table_filter input');

    // need to remove these to override the default search functionality
    searchBox.off('input');
    searchBox.off('keyup');

    searchBox.on('keyup', function(data, next) {
        table.column( 'name:name' ).search(searchBox.val()).draw();
    });
} );

var selectedSorter;
var selectedFilter;

function initPositionSorters(table) {
    var sorters = $(".position-sorter");
    selectedSorter = $(sorters[0]);

    sorters.each(function(index) {
        var sorter = $(this);

        sorter.click(function() {
            selectedSorter.removeClass('active');
            sorter.addClass('active');
            table.column( 'positions:name' ).search(positionSearches[sorter.text()], true).draw();
            selectedSorter = sorter;
        });
    });
}

function initLeagueFilter(table) {
    var filters = $(".league-filter");
    selectedFilter = $(filters[0]);

    filters.each(function(index) {
        var filter = $(this);

        filter.click(function() {
            selectedFilter.removeClass('active');
            filter.addClass('active');
            table.column( 'team:name' ).search(leagueSearches[filter.text()], true).draw();
            selectedFilter = filter;
        });
    });
}

function initProjectionFilters(table) {
    $('.proj-filter').change(function() {
        // don't allow unchecking if this is the only one that's checked
        var value = $(this).val();
        if (!$(this).is(":checked")) {
            var numStillChecked = $(".proj-filter:checked").length;
            if (numStillChecked === 0) {
                $(this).prop('checked', true);
                return;
            }
        }
        
        table.ajax.reload();
    }); 
}

var leagueSearches = {
    All: "",
    AL: "NYY|BOS|TOR|BAL|TB|CHA|DET|CLE|KC|MIN|OAK|TEX|HOU|LAA|SEA",
    NL: "NYN|ATL|WAS|MIA|PHI|CHN|PIT|STL|MIL|CIN|COL|SD|SF|ARI|LAD"
}

var positionSearches = {
    C: "C",
    "1B": "1B",
    "2B": "2B",
    "3B": "3B",
    SS: "SS",
    OF: "OF",
    DH: "DH",
    CI: "1B|3B",
    MI: "2B|SS",
    All: ""
};