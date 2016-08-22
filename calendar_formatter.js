var inputFileObj = null;
var outputFileName = "";
document.getElementById('inputFile').addEventListener('change', selectInputFile, false);
document.getElementById('outputFile').addEventListener('keyup', outputFileOnKeyUp, false);
document.getElementById('processButton').disabled = !(inputFileObj && outputFileName !== "");

// Opera 8.0+
var isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
// Firefox 1.0+
var isFirefox = typeof InstallTrigger !== 'undefined';
// At least Safari 3+: "[object HTMLElementConstructor]"
var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf('Constructor') > 0;
// Internet Explorer 6-11
var isIE = /*@cc_on!@*/false || !!document.documentMode;
// Edge 20+
var isEdge = !isIE && !!window.StyleMedia;
// Chrome 1+
var isChrome = !!window.chrome && !!window.chrome.webstore;
// Blink engine detection
var isBlink = (isChrome || isOpera) && !!window.CSS;

// Only check if not Chrome for now. If this doesn't work in the future, use the other variables for more thorough check
// if (!isChrome) {
//     document.body.innerHTML = 'Use Google Chrome to enable calendar formatting tool. Download it here: https://www.google.com/chrome/browser/desktop/';
// }

var ampersandGlobalRegEx = new RegExp(/&amp;/, 'g');
var doubleSpaceGlobalRegEx = new RegExp(/  /, 'g');
var lineBreakGlobalRegEx = new RegExp(/\r\n?|\n/, 'g');

function selectInputFile(evt) {
    inputFileObj = evt.target.files[0];
    document.getElementById('processButton').disabled = !(inputFileObj && outputFileName !== "");
}

function outputFileOnKeyUp() {
    outputFileName = document.getElementById('outputFile').value;
    document.getElementById('processButton').disabled = !(inputFileObj && outputFileName !== "");
}

function processButtonPressed() {
    var config = {
        delimiter: "",	// auto-detect
        newline: "\n",	// auto-detect
        header: true,
        dynamicTyping: true,
        preview: 0,
        encoding: "",
        worker: false,
        comments: false,
        step: undefined,
        complete: processData,
        error: errorHandler,
        download: false,
        skipEmptyLines: false,
        chunk: undefined,
        fastMode: undefined,
        beforeFirstChunk: undefined,
        withCredentials: undefined
    };
    Papa.parse(inputFileObj, config);
}

function errorHandler(error, file) {
    console.log("Parsing error:", error, file);
    alert('ERROR! ' + error);
}

function processData(results, file) {
    console.log("Parsing complete:", results, file);

    // First split data into events, venues and organizers
    var events = [];
    var venues = {};
    var organizers = {};

    var data = results.data;
    for (var x = 0; x < data.length; x++) {
        switch (data[x].wp_post_type) {
            case "tribe_events":
                if (data[x].cf__EventStartDate) {
                    if (isChrome) {
                        var startDateString = data[x].cf__EventStartDate;
                        data[x].cf__EventStartDate = new Date(startDateString);
                    } else {
                        var startDateString = data[x].cf__EventStartDate;
                        var thisMoment = moment(startDateString);
                        data[x].cf__EventStartDate = thisMoment.toDate();
                    }
                } else {
                    alert("Error: No 'cf__EventStartDate' for " + data[x].wp_post_title);
                    return;
                }

                if (data[x].cf__EventEndDate) {
                    if (isChrome) {
                        var endDateString = data[x].cf__EventEndDate;
                        data[x].cf__EventEndDate = new Date(endDateString);
                    } else {
                        var endDateString = data[x].cf__EventEndDate;
                        var thisMoment = moment(endDateString);
                        data[x].cf__EventEndDate = thisMoment.toDate();
                    }
                } else {
                    alert("Error: No 'cf__EventEndDate' for " + data[x].wp_post_title);
                    return;
                }

                var startDate = data[x].cf__EventStartDate;
                var endDate = data[x].cf__EventEndDate;
                var startTime = startDate.getTime();
                var endTime = endDate.getTime();

                // Check for "all day" events
                if ((((endTime - startTime) >= 86340000) && ((endTime - startTime) <= 86400000)) && (startDate.getHours() === 0) && (endDate.getHours() === 23)) {
                    data[x].allDay = true;
                } else {
                    data[x].allDay = false;
                }

                // Check for "multi day" events and add to events list accordingly
                data[x].multiDay = false;
                data[x].firstOfMultiDay = false;
                data[x].lastOfMultiDay = false;
                if (startDate.getDate() !== endDate.getDate() && endDate.getHours() >= 3) {

                    var timeDiff = Math.abs(endDate.getTime() - startDate.getTime());
                    var numOfDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

                    // If only one day, make sure it's two for presentation
                    if (numOfDays === 1) {
                        numOfDays++;
                    }

                    for (var d = 0; d < numOfDays; d++) {
                        var newEvent = JSON.parse(JSON.stringify(data[x]));

                        if (d === 0) {
                            newEvent.multiDay = true;
                            newEvent.firstOfMultiDay = true;
                            newEvent.allDay = false;
                            newEvent.cf__EventStartDate = new Date(newEvent.cf__EventStartDate);
                            newEvent.cf__EventEndDate = new Date(newEvent.cf__EventStartDate);
                        } else if (d === numOfDays-1) {
                            newEvent.multiDay = true;
                            newEvent.lastOfMultiDay = true;
                            newEvent.allDay = true;
                            newEvent.cf__EventStartDate = new Date(newEvent.cf__EventEndDate);
                            newEvent.cf__EventEndDate = new Date(newEvent.cf__EventEndDate);
                        } else {
                            var newDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                            newDate.setDate(newDate.getDate()+d);
                            newEvent.cf__EventStartDate = newDate;
                            newEvent.cf__EventEndDate = newDate;
                            newEvent.allDay = true;
                        }

                        events.push(newEvent);
                    }
                } else {
                    events.push(data[x]);
                }

            break;

            case "tribe_venue":
                venues[data[x].wp_ID] = data[x];
            break;

            case "tribe_organizer":
                organizers[data[x].wp_ID] = data[x];
            break;

            case "post":
                events.push(data[x]);
            break;

            default:
                console.log("Entry doesn't have supported wp_post_type: " + data[x].wp_post_type);
            break;
        }
    }

    // Now sort the events by date if it's a "tribe_event", if "post", it's sorted before other types
    events.sort(function (a, b) {
        if (a.wp_post_type === "post" && b.wp_post_type === "post") {
            return 0;
        } else if (a.wp_post_type === "post") {
            return -1;
        } else if (b.wp_post_type === "post") {
            return 1;
        } else {
            if (a.cf__EventStartDate && b.cf__EventStartDate) {
                if (a.cf__EventStartDate < b.cf__EventStartDate) {
                    return -1;
                } else if (a.cf__EventStartDate > b.cf__EventStartDate) {
                    return 1;
                } else {
                    if ('allDay' in a && 'allDay' in b) {
                        if (a.allDay && !b.allDay) {
                            return -1;
                        } else if (!a.allDay && b.allDay) {
                            return 1;
                        } else {
                            return 0;
                        }
                    } else if ('allDay' in a) {
                        if (a.allDay) {
                            return -1;
                        } else {
                            return 0;
                        }
                    } else if ('allDay' in b) {
                        if (b.allDay) {
                            return 1;
                        } else {
                            return 0;
                        }
                    } else {
                        return 0;
                    }
                }
            } else {
                return 0;
            }
        }
    });

    // Next go through each event to format them, looking up data in organizer and venue maps as necessary
    var curDate = null;
    var outputText = "";
    for (var e = 0; e < events.length; e++) {

        // Web only listing, don't want to ouput for print
        if (events[e].cf__ecp_custom_8 && events[e].cf__ecp_custom_8.toLowerCase() === "yes") {
            continue;
        }

        var thisEventVenue = null;
        if (events[e].cf__EventVenueID) {
            thisEventVenue = venues[events[e].cf__EventVenueID];
        }

        var thisEventOrganizer = null;
        if (events[e].cf__EventOrganizerID) {
            thisEventOrganizer = organizers[events[e].cf__EventOrganizerID];
        }

        var addTimeAtEnd = false;
        var timeAtEndString = null;
        // Get start and end times and format the date and time
        if (events[e].cf__EventStartDate && events[e].cf__EventEndDate) {
            // If the date is a new one, add the date heading
            if (!curDate || curDate !== events[e].cf__EventStartDate.toDateString()) {
                curDate = events[e].cf__EventStartDate.toDateString();
                outputText += (curDate);
                outputText += ("\r\n");
            }

            if (events[e].allDay) {
                if (events[e].multiDay && events[e].lastOfMultiDay) {
                    var endHours = events[e].cf__EventEndDate.getHours();
                    var endMins = events[e].cf__EventEndDate.getMinutes();
                    var endAmPm = endHours >= 12 ? "pm" : "am";
                    endHours = endHours % 12;
                    endHours = endHours ? endHours : 12;
                    endMins = endMins < 10 ? "0" + endMins : endMins;

                    var endMinsString = (endMins === "00") ? "" : (":" + endMins);

                    addTimeAtEnd = true;
                    timeAtEndString = (" Ends at " + endHours + endMinsString + endAmPm + ". ");
                } else {
                    // Do nothing for time for this case
                    // Just a placeholder here in case this changes
                    outputText += ("");
                }
            } else {
                if (events[e].multiDay && events[e].firstOfMultiDay) {
                    var startHours = events[e].cf__EventStartDate.getHours();
                    var startMins = events[e].cf__EventStartDate.getMinutes();
                    var startAmPm = startHours >= 12 ? "pm" : "am";
                    startHours = startHours % 12;
                    startHours = startHours ? startHours : 12;
                    startMins = startMins < 10 ? "0" + startMins : startMins;

                    var startMinsString = (startMins === "00") ? "" : (":" + startMins);

                    outputText += (startHours + startMinsString + startAmPm + " ");
                } else {
                    var startHours = events[e].cf__EventStartDate.getHours();
                    var startMins = events[e].cf__EventStartDate.getMinutes();
                    var startAmPm = startHours >= 12 ? "pm" : "am";
                    startHours = startHours % 12;
                    startHours = startHours ? startHours : 12;
                    startMins = startMins < 10 ? "0" + startMins : startMins;

                    var startMinsString = (startMins === "00") ? "" : (":" + startMins);

                    var endHours = events[e].cf__EventEndDate.getHours();
                    var endMins = events[e].cf__EventEndDate.getMinutes();
                    var endAmPm = endHours >= 12 ? "pm" : "am";
                    endHours = endHours % 12;
                    endHours = endHours ? endHours : 12;
                    endMins = endMins < 10 ? "0" + endMins : endMins;

                    var endMinsString = (endMins === "00") ? "" : (":" + endMins);

                    // If start and end are the same, only list one time
                    if (startHours === endHours && startMins === endMins && startAmPm === endAmPm) {
                        outputText += (startHours + startMinsString + startAmPm + " ");
                    } else {
                        outputText += (startHours + startMinsString + startAmPm + "-" + endHours + endMinsString + endAmPm + " ");
                    }
                }
            }
        }

        var intermediateTitle = null;
        if (events[e].wp_post_title) {
            events[e].wp_post_title = events[e].wp_post_title.toString();
            intermediateTitle = events[e].wp_post_title.trim();
        }
        
        if (intermediateTitle && !intermediateTitle.match(/[!.?]$/)) {
            intermediateTitle += ".";
        }

        if (intermediateTitle) {
            outputText += ("<strong>" + intermediateTitle + "</strong> ");
        }

        var intermediateContent = null;
        if (events[e].wp_post_content) {
            events[e].wp_post_content = events[e].wp_post_content.toString();
            intermediateContent = events[e].wp_post_content.trim();
        }
        
        if (intermediateContent) {
            intermediateContent = intermediateContent.replace(lineBreakGlobalRegEx, ' ');
            outputText += intermediateContent;

            outputText = outputText.trim();
            if (outputText.match(/[!;.?]$/)) {
                outputText += (" ");
            } else {
                outputText += (". ");
            }
        }

        if (thisEventVenue) {

            if (thisEventVenue.cf__VenueVenue) {
                thisEventVenue.cf__VenueVenue = thisEventVenue.cf__VenueVenue.toString();
            }
            if (thisEventVenue.cf__VenueAddress) {
                thisEventVenue.cf__VenueAddress = thisEventVenue.cf__VenueAddress.toString();
            }
            if (thisEventVenue.cf__VenueCity) {
                thisEventVenue.cf__VenueCity = thisEventVenue.cf__VenueCity.toString();
            }

            if (thisEventVenue.cf__VenueVenue.trim() && thisEventVenue.cf__VenueAddress.trim() && thisEventVenue.cf__VenueCity.trim()) {
                outputText += (thisEventVenue.cf__VenueVenue.trim() + ", " + thisEventVenue.cf__VenueAddress.trim() + ", " +  thisEventVenue.cf__VenueCity.trim());
            } else if (thisEventVenue.cf__VenueVenue.trim() && thisEventVenue.cf__VenueAddress.trim()) {
                outputText += (thisEventVenue.cf__VenueVenue.trim() + ", " + thisEventVenue.cf__VenueAddress.trim());
            } else if (thisEventVenue.cf__VenueAddress.trim() && thisEventVenue.cf__VenueCity.trim()) {
                outputText += (thisEventVenue.cf__VenueAddress.trim() + ", " + thisEventVenue.cf__VenueCity.trim());
            } else if (thisEventVenue.cf__VenueVenue.trim() && thisEventVenue.cf__VenueCity.trim()) {
                outputText += (thisEventVenue.cf__VenueVenue.trim() + ", " + thisEventVenue.cf__VenueCity.trim());
            } else if (thisEventVenue.cf__VenueVenue.trim()) {
                outputText += (thisEventVenue.cf__VenueVenue.trim());
            } else if (thisEventVenue.cf__VenueAddress.trim()) {
                outputText += (thisEventVenue.cf__VenueAddress.trim());
            } else if (thisEventVenue.cf__VenueCity.trim()) {
                outputText += (thisEventVenue.cf__VenueCity.trim());
            } else {
                // Do nothing here
            }

            outputText = outputText.trim();
            if (outputText.match(/[!;.?]$/)) {
                outputText += (" ");
            } else {
                outputText += (". ");
            }
        }

        if (thisEventOrganizer) {
            if (thisEventOrganizer.cf__OrganizerPhone) {
                thisEventOrganizer.cf__OrganizerPhone = thisEventOrganizer.cf__OrganizerPhone.toString();
            } 
            if (thisEventOrganizer.cf__OrganizerEmail) {
                thisEventOrganizer.cf__OrganizerEmail = thisEventOrganizer.cf__OrganizerEmail.toString();
            }
        }

        if (thisEventOrganizer && (thisEventOrganizer.cf__OrganizerPhone.trim() || thisEventOrganizer.cf__OrganizerEmail.trim())) {
            outputText += ("Info: ");

            if (thisEventOrganizer.cf__OrganizerPhone.trim()) {
                outputText += (thisEventOrganizer.cf__OrganizerPhone.trim());
            }

            if (thisEventOrganizer.cf__OrganizerEmail.trim()) {
                if (thisEventOrganizer.cf__OrganizerPhone.trim()) {
                    outputText += (", ");
                }

                outputText += (thisEventOrganizer.cf__OrganizerEmail.trim());
            }
        }

        if (events[e].cf__EventURL) {
            events[e].cf__EventURL = events[e].cf__EventURL.toString();
        }
        
        if (events[e].cf__EventURL.trim()) {
            if (thisEventOrganizer && (thisEventOrganizer.cf__OrganizerPhone.trim() || thisEventOrganizer.cf__OrganizerEmail.trim())) {
                outputText += (", ");
            }

            outputText += (events[e].cf__EventURL.trim());
        }

        if (events[e].cf__EventCost || events[e].cf__ecp_custom_2) {
            outputText = outputText.trim();
            if (outputText.match(/[!;.?]$/)) {
                outputText += (" ");
            } else {
                outputText += (". ");
            }

            if (events[e].cf__ecp_custom_2) {
                if (typeof events[e].cf__ecp_custom_2 === "number") {
                    outputText += ("$");
                }
                outputText += (events[e].cf__ecp_custom_2);
            } else if (events[e].cf__EventCost) {
                if (typeof events[e].cf__EventCost === "number") {
                        outputText += ("$");
                }
                outputText += (events[e].cf__EventCost);
            }
        }

        outputText = outputText.trim();
        if (outputText.match(/[!;.?]$/)) {
            outputText += (" ");
        } else {
            outputText += (". ");
        }

        if (addTimeAtEnd) {
            outputText += timeAtEndString;
        }

        outputText += ("\r\n");
    }

    // Final touches on output text
    outputText = outputText.replace(ampersandGlobalRegEx, '&');
    outputText = outputText.replace(doubleSpaceGlobalRegEx, ' ');

    writeOutpuFile(outputText);
}

function writeOutpuFile(outputText) {
    saveAs(new Blob([outputText], {type: "text/plain;charset=utf-8"}), outputFileName);
}