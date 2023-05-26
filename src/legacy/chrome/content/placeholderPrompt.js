/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
const Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

Services.scriptloader.loadSubScript("chrome://clippings/content/lib/i18n.js", this, "UTF-8");


var gDlgArgs;

    
//
// DOM utility function
//

function $(aID) {
  return document.getElementById(aID);
}



function init()
{
  gDlgArgs = window.arguments[0].wrappedJSObject;

  i18n.updateDocument({extension: gDlgArgs.localeData});

  let hostAppVer = Number(gDlgArgs.hostAppVer.split(".")[0]);
  if (hostAppVer >= 114) {
    $("ae-clippings-placeholder-prompt").dataset.dlgCutoff = true;
  }

  let promptText = $("prompt-text");
  let promptDeck = $("prompt-deck");
  let strKey;

  if (gDlgArgs.selectMode) {
    strKey = "plchldrPmtSelectDesc";
    promptDeck.selectedIndex = 1;

    var menupopup = document.createXULElement("menupopup");
    var selectableValues = gDlgArgs.defaultValue.split("|");

    for (let value of selectableValues) {
      var menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("label", value);
      menuitem.setAttribute("value", value);
      menupopup.appendChild(menuitem);
    }
    let phValueMenu = $("select-placeholder-value-menu");
    phValueMenu.appendChild(menupopup);
    phValueMenu.selectedIndex = 0;
  }
  else {
    strKey = "plchldrPromptSingleDesc";
    promptDeck.selectedIndex = 0;
    $("placeholder-value").value = gDlgArgs.defaultValue;
  }
  promptText.value = gDlgArgs.localeData.localizeMessage(strKey, [gDlgArgs.varName]);

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
