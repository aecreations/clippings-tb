/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");


var gDlgArgs, gStrBundle;

    
//
// DOM utility function
//

function $(aID) {
  return document.getElementById(aID);
}



function init()
{
  gDlgArgs = window.arguments[0].wrappedJSObject;
  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");
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

    var menupopup = document.createElement("menupopup");
    var selectableValues = gDlgArgs.defaultValue.split("|");

    for (let value of selectableValues) {
      var menuitem = document.createElement("menuitem");
      menuitem.setAttribute("label", value);
      menuitem.setAttribute("value", value);
      menupopup.appendChild(menuitem);
    }
    let phValueMenu = $("select-placeholder-value-menu");
    phValueMenu.appendChild(menupopup);
    phValueMenu.selectedIndex = 0;
  }
  else {
    strKey = "substPromptText";
    promptDeck.selectedIndex = 0;
    $("placeholder-value").value = gDlgArgs.defaultValue;
  }
  promptText.value = gStrBundle.getFormattedString(strKey, [gDlgArgs.varName]);

  document.addEventListener("dialogaccept", aEvent => {
    if (! accept()) {
      aEvent.preventDefault();
    }
  });
  document.addEventListener("dialogcancel", aEvent => { cancel() });
}


function accept()
{
  if (gDlgArgs.selectMode) {
    let phValueMenu = $("select-placeholder-value-menu");
    let selectedIdx = phValueMenu.selectedIndex;
    if (selectedIdx == -1) {
      aeUtils.beep();
      return false;
    }

    let selectedItem = phValueMenu.getItemAtIndex(selectedIdx);
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
