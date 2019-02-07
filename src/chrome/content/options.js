/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeConstants.js");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");


const Cc = Components.classes;
const Ci = Components.interfaces;

var gStrBundle;
var gIsDlgInitialized;


function $(aID) 
{
  return document.getElementById(aID);
}


function initDlg()
{
  // Initialization of the entire pref dialog. Initialization of the individual
  // pref panes should go into their respective event handlers for the
  // `onpaneload' event.
  // NOTE: The pref dialog's `onload' event is called *after* the `onpaneload'
  // events in each pref pane!
  if (! gIsDlgInitialized) {
    gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

    var titleKey;
    if (aeUtils.getOS() == "WINNT") {
      titleKey = "clippingsOptions";
    }
    else {
      titleKey = "clippingsPreferences";
    }
    $("ae-clippings-preferences").setAttribute("title", gStrBundle.getString(titleKey));

    gIsDlgInitialized = true;
  }
}


function applyPrefChanges()
{
  // Function applyDataSourcePrefChanges() is only defined when the Data Source
  // pane was loaded.
  if (typeof(applyDataSourcePrefChanges) == "function") {
    applyDataSourcePrefChanges();
  }
}


function unloadDlg()
{
  var instantApplyPrefs = $("ae-clippings-preferences").instantApply;

  if (instantApplyPrefs) {
    applyPrefChanges();
  }
}
