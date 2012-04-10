﻿kg.FilterManager = function (options) {
    var self = this,
        wildcard = options.filterWildcard || "*",
        regExCache = {}, // a cache of filterString to regex objects, eg: { 'abc%' : RegExp("abc[^\']*, "gi") }
        initPhase = 0, // flag for allowing us to do initialization only once and prevent dependencies from getting improperly registered
        internalFilteredData = ko.observableArray([]); // obs array that we use to manage the filtering before it updates the final data

    // first check the wildcard as we only support * and % currently
    if (wildcard === '*' || wildcard === '%') {
        // do nothing
    } else {
        throw new Error("You can only declare a percent sign (%) or an asterisk (*) as a wildcard character");
    }

    // map of column.field values to filterStrings
    this.filterInfo = options.filterInfo || ko.observable();

    // the obs array of data that the user defined
    this.data = options.data;

    // the obs array of filtered data we return to the grid
    this.filteredData = ko.computed(function () {
        var data = internalFilteredData();

        //this is a bit funky, but it prevents our filtered data from being registered as a subscription to our grid.update bindingHandler
        if (initPhase > 0) {
            return data;
        } else {
            return self.data();
        }
    });

    // utility function for checking data validity
    var isEmpty = function (data) {
        return (data === null || data === undefined || data === '');
    };

    // performs regex matching on data strings 
    var matchString = function (itemStr, filterStr) {
        //first check for RegEx thats already built
        var regex = regExCache[filterStr];

        //if nothing, build the regex
        if (!regex) {
            var replacer = "";

            //escape any wierd characters they might using
            filterStr = filterStr.replace(/\\/g, "\\");
            
            // build our replacer regex
            if (wildcard === "*") {
                replacer = /\*/g;
            } else {
                replacer = /\%/g;
            }

            //first replace all % percent signs with the true regex wildcard *
            var regexStr = filterStr.replace(replacer, "[^\']*");                     

            //ensure that we do "beginsWith" logic
            regexStr = "^" + regexStr;

            // then create an actual regex object
            regex = new RegExp(regexStr, "gi");

            // store it
            regExCache[filterStr] = regex;
        }

        return itemStr.match(regex);
    };

    // the core logic for filtering data
    var filterData = function () {
        var filterInfo = self.filterInfo(),
            data = self.data(),
            keepRow = false, // flag to say if the row will be removed or kept in the viewport
            match = true, // flag for matching logic
            newArr = [], // the filtered array
            field, // the field of the column that we are filtering
            itemData, // the data from the specific row's column
            itemDataStr, // the stringified version of itemData
            filterStr; // the user-entered filtering criteria

        // make sure we even have work to do before we get started
        if (!filterInfo || $.isEmptyObject(filterInfo) || options.useExternalFiltering) {
            internalFilteredData(data);
            return;
        }

        //clear out the regex cache so that we don't get improper results
        regExCache = {};

        // filter the data array 
        newArr = ko.utils.arrayFilter(data, function (item) {

            //loop through each property and filter it
            for (field in filterInfo) {

                if (filterInfo.hasOwnProperty(field)) {

                    // pull the data out of the item
                    itemData = ko.utils.unwrapObservable(item[field]);

                    // grab the user-entered filter criteria
                    filterStr = filterInfo[field];

                    // make sure they didn't just enter the wildcard character
                    if (!isEmpty(filterStr) && filterStr !== wildcard) { 

                        // execute regex matching
                        if (isEmpty(itemData)) {
                            match = false;
                        } else if (typeof itemData === "string") {
                            match = matchString(itemData, filterStr);
                        } else {
                            itemDataStr = itemData.toString();
                            match = matchString(itemDataStr, filterStr);
                        }
                    }
                }

                //supports "AND" filtering logic
                if (keepRow && !match) {
                    keepRow = false;
                } else if (!keepRow && match) {
                    keepRow = true; //should only catch on the first pass
                }

                //now if we catch anything thats not a match, break out of the loop
                if (!match) { break; }
            }

            //reset variables
            filterStr = null;
            itemData = null;
            itemDataStr = null;
            match = true;

            return keepRow;
        });

        // finally set our internal array to the filtered stuff, which will tell the rest of the manager to propogate it up to the grid
        internalFilteredData(newArr);

    };

    //create subscriptions
    this.data.subscribe(filterData);
    this.filterInfo.subscribe(filterData);

    // the grid uses this to asign the change handlers to the filter boxes during initialization
    this.createFilterChangeCallback = function (col) {

        // the callback
        return function (newFilterVal) {
            var info = self.filterInfo();

            if (!info && !newFilterVal) {
                return;
            }

            //if we're still here, we may need to new up the info
            if (!info) { info = {}; }

            if ((newFilterVal === null ||
                newFilterVal === undefined ||
                newFilterVal === "") &&
                info[col.field]) { // we don't it to be null or undefined

                //smoke it so we don't loop through it for filtering anymore!
                delete info[col.field];

            } else if (newFilterVal !== null && newFilterVal !== undefined) {

                info[col.field] = newFilterVal;

            }
            self.filterInfo(info);
        };
    };

    //increase this after initialization so that the computeds fire correctly
    initPhase = 1;
};