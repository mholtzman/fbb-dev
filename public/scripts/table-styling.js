$(document).ready(function() {
    var table = $('#players-table').DataTable({
        dom: 'l<"toolbar">frtp',
        info: false,
        pageLength: 25,
        pagingType: 'simple',
        lengthMenu: [ 25, 50, 100 ],
        order: [[11, 'desc']],
        columns: [
            { name: 'name' },
            { name: 'team' },
            { name: 'positions' },
            { name: 'ab' },
            { name: 'hits' },
            { name: 'avg' },
            { name: 'r' },
            { name: 'rbi' },
            { name: 'hr' },
            { name: 'sb' },
            { name: 'sgp' },
            { name: 'aSGP' }
        ],
        columnDefs: [
            { targets: [3,4,5,6,7,8,9,10,11], orderSequence: ['desc'], searchable: false },
            { targets: [0,1,2], searchable: true, orderable: false } // these columns can be filtered, but not sored
            
        ]
    });

    var toolbar = $("div.toolbar");

    var posToolbar = $("#position-sort-toolbar");
    posToolbar.detach();
    posToolbar.appendTo(toolbar);

    initPositionSorters(table, toolbar);

    var searchBox = $('#players-table_filter input');

    // need to remove these to override the default search functionality
    searchBox.off('input');
    searchBox.off('keyup');

    searchBox.on('keyup', function(data, next) {
        table.column( 'name:name' ).search(searchBox.val()).draw();
    });
} );

function getPlayerPosition(player) {
    return 'SS';
}

var selectedSorter;

function initPositionSorters(table, toolbar) {
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