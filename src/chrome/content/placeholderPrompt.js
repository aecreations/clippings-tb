/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeUtils.js");


var gDlgArgs, gStrBundle;

    
//
// DOM utility function
//

function $(aID) {
  return document.getElementById(aID);
}



function initDlg()
{
  gDlgArgs = window.arguments[0].wrappedJSObject;
  gStrBundle = $("ae-clippings-strings");
  var promptText = $("prompt-text");
  var promptDeck = $("prompt-deck");
  var strKey;

  if (gDlgArgs.autoIncrementMode) {
    strKey = "autoIncrPromptText";
    promptDeck.selectedIndex = 0;
    $("placeholder-value").value = gDlgArgs.defaultValue;
  }
  else if (gDlgArgs.selectMode) {
    strKey = "selectPromptText";
    promptDeck.selectedIndex = 1;

    var menupopup = $("select-placeholder-value-menu").firstChild;
    var selectableValues = gDlgArgs.defaultValue.split("|");

    for (let value of selectableValues) {
      var menuitem = document.createElement("menuitem");
      menuitem.setAttribute("label", value);
      menuitem.setAttribute("value", value);
      menupopup.appendChild(menuitem);
    }
  }
  else {
    strKey = "substPromptText";
    promptDeck.selectedIndex = 0;
    $("placeholder-value").value = gDlgArgs.defaultValue;
  }
  promptText.value = gStrBundle.getFormattedString(strKey, [gDlgArgs.varName]);
}


function accept()
{
  if (gDlgArgs.selectMode) {
    let selectedItem = $("select-placeholder-value-menu").selectedItem;
    if (! selectedItem) {
      aeUtils.beep();
      return false;
    }
    gDlgArgs.userInput = selectedItem.value;
  }
  else {
    gDlgArgs.userInput = $("placeholder-value").value;
  }

  return true;
}


function cancel() 
{
  gDlgArgs.userCancel = true;
  return true;
}
