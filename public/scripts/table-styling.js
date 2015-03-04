$(document).ready(function() {
    var table = $('#players-table').DataTable({
        info: false,
        pageLength: 25,
        pagingType: 'simple',
        lengthMenu: [ 25, 50, 100 ],
        order: [[14, 'desc']],
        columns: [
            { name: "name", searchable: true, orderable: false },
            { name: "team", searchable: true, orderable: false },
            { name: "positions", searchable: true, orderable: false },
            null, null, null, null, null, null, null, null, null, null, null, null
        ],
        columnDefs: [
            { targets: '_all', orderSequence: ['desc'], searchable: false }
            
        ]
    });

    initPositionSorters(table);
    initLeagueFilter(table);

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