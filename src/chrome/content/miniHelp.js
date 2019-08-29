/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");

function init() 
{
  var strBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");
  var helpStr;

  try {
    document.getElementById("hlp-title").value = window.arguments[0];
  }
  catch (e) {}

  try {
    helpStr = window.arguments[1];
  }
  catch (e) { 
    helpStr = strBundle.getString("helpMsg");
  }

  document.getElementById("minihelp-text").value = helpStr;

  var dlg = document.getElementById("ae-clippings-minihelp");
  dlg.getButton("accept").focus();
}
