/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeUtils.js");


var gDlgArgs = window.arguments[0];
var gStrBundle;


function $(aID)
{
  return document.getElementById(aID);
}


function init()
{
  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  var placeholderDeck = $("placeholder-deck");
  placeholderDeck.selectedIndex = gDlgArgs.placeholderType;

  var labelKey = "placeholderName";

  switch (gDlgArgs.placeholderType) {
  case gDlgArgs.AUTO_INCREMENT:
    labelKey += "AutoIncr";
    break;

  case gDlgArgs.CUSTOM:
  default:
    labelKey += "Custom";
    break;
  }

  $("placeholder-name-label").value = gStrBundle.getString(labelKey);
}


function validatePlaceholderName(aName)
{
  if (aName.match(/[^a-zA-Z0-9_\u0080-\u00FF\u0100-\u017F\u0180-\u024F\u0400-\u04FF\u0590-\u05FF]/)) {
    return false;
  }
  return true;
}


function accept()
{
  var placeholderNameElt = $("placeholder-name");
  var placeholderName = placeholderNameElt.value;

  if (! placeholderName) {
    aeUtils.beep();
    placeholderNameElt.focus();
    return false;
  }

  if (! validatePlaceholderName(placeholderName)) {
    aeUtils.alertEx(gStrBundle.getString("appName"), gStrBundle.getString("illegalPlaceholderName"));
    placeholderNameElt.focus();
    placeholderNameElt.select();
    return false;
  }

  var placeholderValue = $("placeholder-default-value").value

    var placeholderDeck = $("placeholder-deck");
 
  if (placeholderDeck.selectedIndex == gDlgArgs.CUSTOM) {
    var placeholder = "$[" + placeholderName;

    if (placeholderValue) {
      placeholder = placeholder + "{" + placeholderValue + "}]";
    }
    else {
      placeholder = placeholder + "]";
    }
    gDlgArgs.placeholder = placeholder;
  }
  else if (placeholderDeck.selectedIndex == gDlgArgs.AUTO_INCREMENT) {
    gDlgArgs.placeholder = "#[" + placeholderName + "]";
  }

  gDlgArgs.userCancel = false;
  return true;
}


function cancel()
{
  gDlgArgs.userCancel = true;
  return true;
}
