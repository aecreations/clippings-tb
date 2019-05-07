/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");

const HTML_NS = "http://www.w3.org/1999/xhtml";

let gDlgArgs = window.arguments[0];
let gStrBundle;

let gDateFormats = [
  "dddd, MMMM Do, YYYY",
  "MMMM D, YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "D MMMM YYYY",
  "D.M.YYYY",
  "DD-MMMM-YYYY",
  "MM/DD/YYYY h:mm A",
  "ddd, MMM DD, YYYY h:mm:ss A ZZ",
];

let gTimeFormats = [
  "h:mm A",
  "H:mm",
  "H:mm:ss",
];


function $(aID)
{
  return document.getElementById(aID);
}


function init()
{
  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  let date = new Date();
  let dtFmtList = $("date-time-format-list");
  let defaultDateFmtOpt = document.createElementNS(HTML_NS, "option");
  defaultDateFmtOpt.setAttribute("value", "DATE");
  defaultDateFmtOpt.appendChild(document.createTextNode(date.toLocaleDateString()));
  dtFmtList.appendChild(defaultDateFmtOpt);

  for (let dateFmt of gDateFormats) {
    let dateFmtOpt = document.createElementNS(HTML_NS, "option");
    dateFmtOpt.setAttribute("value", dateFmt);
    let dateFmtOptTxt = document.createTextNode(moment().format(dateFmt));
    dateFmtOpt.appendChild(dateFmtOptTxt);
    dtFmtList.appendChild(dateFmtOpt);
  }

  let defaultTimeFmtOpt = document.createElementNS(HTML_NS, "option");
  defaultTimeFmtOpt.setAttribute("value", "TIME");
  defaultTimeFmtOpt.appendChild(document.createTextNode(date.toLocaleTimeString()));
  dtFmtList.appendChild(defaultTimeFmtOpt);

  for (let timeFmt of gTimeFormats) {
    let timeFmtOpt = document.createElementNS(HTML_NS, "option");
    timeFmtOpt.setAttribute("value", timeFmt);
    let timeFmtOptTxt = document.createTextNode(moment().format(timeFmt));
    timeFmtOpt.appendChild(timeFmtOptTxt);
    dtFmtList.appendChild(timeFmtOpt);
  }

  dtFmtList.selectedIndex = 0;

  document.addEventListener("dialogaccept", aEvent => { accept() });
  document.addEventListener("dialogcancel", aEvent => { cancel() });
}


function accept()
{
  let dtFmtList = $("date-time-format-list");
  let selectedFmt = dtFmtList.options[dtFmtList.selectedIndex].value;

  if (selectedFmt == "DATE" || selectedFmt == "TIME") {
    gDlgArgs.placeholder = "$[" + selectedFmt + "]";
  }
  else {
    if (dtFmtList.selectedIndex > gDateFormats.length) {
      gDlgArgs.placeholder = "$[TIME(" + selectedFmt + ")]";
    }
    else {
      gDlgArgs.placeholder = "$[DATE(" + selectedFmt + ")]";
    }
  }
  
  gDlgArgs.userCancel = false;
  
  return true;
}


function cancel()
{
  gDlgArgs.userCancel = true;
  return true;
}
