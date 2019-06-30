/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
const {aeClippingsService} = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");

const Cc = Components.classes;
const Ci = Components.interfaces;

// Truncate clipping name in the search result popup at this number of char's.
const MAX_NAME_LEN = 64;

var gDlgArgs, gStrBundle;
var gClippingsSvc;


//
// DOM utility function
//

function $(aID)
{
  return document.getElementById(aID);
}



function init()
{
  gDlgArgs = window.arguments[0];
  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    alert(e);
  }

  document.addEventListener("dialogcancel", aEvent => { cancel() });
}


function updateSearchResults(aSearchText)
{
  var srchResultsPopup = $("search-results-popup");
  var srchResultsListbox = $("search-results-listbox");
  while (srchResultsListbox.childNodes.length > 0) {
    srchResultsListbox.removeChild(srchResultsListbox.firstChild);
  }

  srchResultsPopup.hidePopup();

  if (aSearchText == "") {
    $("search-status").value = "";
    $("num-matches").value = "";
    return;
  }

  let srchResults = gClippingsSvc.findByName(aSearchText, false, false);
  let numMatches = srchResults.length;

  if (numMatches == 0) {
    $("search-status").value = gStrBundle.getString("findBarNotFound");
  }
  else {
    $("search-status").value = gStrBundle.getFormattedString("findBarMatches", [numMatches]);
    $("num-matches").value = gStrBundle.getFormattedString("findBarMatches", [numMatches]);

    // Populate the popup.
    var max = numMatches;
    for (let i = 0; i < max; i++) {
      var clippingURI = srchResults[i];
      var name = gClippingsSvc.getName(clippingURI);
      var text = gClippingsSvc.getText(clippingURI);
      
      // Truncate name and text
      var originalLen = name.length;
      name = name.substr(0, MAX_NAME_LEN);
      name += (originalLen > name.length ? " ..." : "");

      var listitem = document.createElement("richlistitem");
      listitem.setAttribute("orient", "vertical");
      listitem.setAttribute("value", clippingURI);

      var nameElt = document.createElement("label");
      var textElt = document.createElement("label");
      nameElt.setAttribute("class", "clipping-name");
      nameElt.setAttribute("value", name);
      textElt.setAttribute("class", "clipping-text");
      textElt.setAttribute("value", text);

      listitem.appendChild(nameElt);
      listitem.appendChild(textElt);

      srchResultsListbox.appendChild(listitem);
    }

    srchResultsPopup.openPopup($("clipping-search"), "after_start", 0, 0, false, false);
  }
}


function selectSearchResult(aEvent)
{
  if (aEvent.target.nodeName == "richlistitem") {
    $("search-results-listbox").focus();
    $("search-results-listbox").selectedItem = aEvent.target;
  }
}


function handleSearchKeys(aEvent, aSearchText)
{
  let listbox = $("search-results-listbox");
  let srchResultsPopup = $("search-results-popup");

  // Press 'Down' arrow key: open search box; beep at user if there are no
  // search results.
  if (aEvent.key == "ArrowDown" || aEvent.key == "Down") {
    if (aSearchText == "") {
      aeUtils.beep();
      return;
    }

    let srchResults = gClippingsSvc.findByName(aSearchText, false, false);
    let numMatches = srchResults.length;

    if (numMatches == 0) {
      aeUtils.beep();
      return;
    }
    
    if (srchResultsPopup.state == "closed") {
      updateSearchResults($("clipping-search").value);
    }

    // BUG!! Search results listbox doesn't focus if user presses ESC to
    // close it, then immediately presses the Down key again.
    aEvent.target.blur();
    listbox.selectedIndex = 0;
    listbox.focus();
  }
  // Press Tab key: if search box is open, then move the focus to it.
  else if (aEvent.key == "Tab") {
    listbox.focus();
    listbox.selectedIndex = 0;
  }
  else if (aEvent.key == "Escape") {
    // Don't do anything
  }
  else {
    updateSearchResults(aSearchText);
  }
}


function handleTabKey(aEvent)
{
  let srchResultsPopup = $("search-results-popup");

  if (aEvent.key == "Tab" && srchResultsPopup.state == "closed") {
    switchToShortcutKeyMode();
  }
}

function switchToShortcutKeyMode()
{
  gDlgArgs.action = gDlgArgs.ACTION_SHORTCUT_KEY;
  gDlgArgs.switchModes = true;
  window.close();
}


function selectClipping()
{
  var clippingURI = $("search-results-listbox").value;

  $("search-results-popup").hidePopup();

  gDlgArgs.clippingURI = clippingURI;
  gDlgArgs.switchModes = false;
  gDlgArgs.userCancel = false;

  // Remember the paste shortcut mode for next time.
  aeUtils.setPref("clippings.paste_shortcut_mode", gDlgArgs.ACTION_SEARCH_CLIPPING);

  window.close();
}


function selectClippingByKeyboard(aEvent)
{
  if (aEvent.key == "ArrowDown" || aEvent.key == "Down") {
    aeUtils.log("searchClipping.js: 'Down' arrow key was pressed. Selected index of search popup: " + $("search-results-listbox").selectedIndex);
  }
  // Press Backspace: user probably wants to correct their input.  Move focus
  // back to the search box.
  else if (aEvent.key == "Backspace") {
    $("clipping-search").focus();
  }
  else if (aEvent.key == "Escape") {
    $("search-results-popup").hidePopup();
    $("clipping-search").focus();
  }
}


function executePaste(aEvent)
{
  // Press Enter to select a search result.
  if (aEvent.key == "Enter") {
    aeUtils.log("Search clipping (keyboard selection)");
    selectClipping();
  }
}


function selectClippingByMouse(aEvent)
{
  if (aEvent.target.nodeName == "richlistitem" || aEvent.target.nodeName == "label") {
    aeUtils.log("Search clipping (mouse selection)");
    selectClipping();
  }
}


function cancel()
{
  // Remember the paste shortcut mode for next time, even if user cancelled.
  aeUtils.setPref("clippings.paste_shortcut_mode", gDlgArgs.ACTION_SEARCH_CLIPPING);

  gDlgArgs.userCancel = true;
  gDlgArgs.switchModes = false;
  return true;
}
