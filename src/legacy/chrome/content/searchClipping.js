/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

Services.scriptloader.loadSubScript("chrome://clippings/content/lib/i18n.js", this, "UTF-8");


// Truncate clipping name in the search result popup at this number of char's.
const MAX_NAME_LEN = 64;

let gDlgArgs, gLocaleData;

let gClippingsSvc = {
  _srchData: [],

  initSearch(aClippingSearchData)
  {
    this._srchData = aClippingSearchData;
  },

  findByName(aSearchText, aMatchCase)
  {
    let rv = [];
    let reFlags = aMatchCase ? "" : "i";
    let regExp = new RegExp(aSearchText, reFlags);

    rv = this._srchData.filter(aClipping => aClipping.name.search(regExp) != -1);

    return rv;
  },
};


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
  gLocaleData = window.arguments[1];

  i18n.updateDocument({ extension: gLocaleData });

  gClippingsSvc.initSearch(gDlgArgs.srchData);

  let srchTextbox = $("clipping-search");
  srchTextbox.addEventListener("keyup", aEvent => {
    handleSearchKeys(aEvent, aEvent.target.value);
  });
  srchTextbox.addEventListener("keydown", aEvent => {
    handleTabKey(aEvent);
  });

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

  let srchResults = gClippingsSvc.findByName(aSearchText);
  let numMatches = srchResults.length;

  if (numMatches == 0) {
    $("search-status").value = gLocaleData.localizeMessage("numMatches", [numMatches]);
  }
  else {
    $("search-status").value = gLocaleData.localizeMessage("numMatches", [numMatches]);
    $("num-matches").value = gLocaleData.localizeMessage("numMatches", [numMatches]);

    // Populate the popup.
    var max = numMatches;
    for (let i = 0; i < max; i++) {
      var clippingID = srchResults[i].clippingID;
      var name = srchResults[i].name;
      var text = srchResults[i].text;
      
      // Truncate name and text
      var originalLen = name.length;
      name = name.substr(0, MAX_NAME_LEN);
      name += (originalLen > name.length ? " ..." : "");

      var listitem = document.createXULElement("richlistitem");
      listitem.setAttribute("orient", "vertical");
      listitem.setAttribute("value", clippingID);

      var nameElt = document.createXULElement("label");
      var textElt = document.createXULElement("label");
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
  // Press Tab key: if search results listbox is open, then move the focus to it.
  else if (aEvent.key == "Tab") {
    listbox.focus();
    listbox.selectedIndex = 0;
  }
  // Press Escape key: clear the search text.
  else if (aEvent.key == "Escape") {
    if (aSearchText) {
      $("clipping-search").value = "";
      aEvent.preventDefault();
    }
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
  else if (aEvent.key == "Escape") {
    if ($("clipping-search").value) {
      aEvent.preventDefault();
    }
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
  var clippingID = $("search-results-listbox").value;

  $("search-results-popup").hidePopup();

  gDlgArgs.clippingID = Number(clippingID);
  gDlgArgs.switchModes = false;
  gDlgArgs.userCancel = false;

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
    aEvent.preventDefault();
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
  gDlgArgs.userCancel = true;
  gDlgArgs.switchModes = false;
  return true;
}
