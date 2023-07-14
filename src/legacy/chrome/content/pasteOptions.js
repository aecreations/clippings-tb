/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;

Services.scriptloader.loadSubScript("chrome://clippings/content/lib/i18n.js", this, "UTF-8");


var gDlgArgs;


function init() 
{
  gDlgArgs = window.arguments[0];

  i18n.updateDocument({ extension: window.arguments[1] });
  
  document.addEventListener("dialogaccept", aEvent => { accept() });
  document.addEventListener("dialogcancel", aEvent => { cancel() });
}

function accept()
{
  let pasteOpts = document.getElementById("paste-as");
  gDlgArgs.pasteOption = pasteOpts.selectedIndex;
  gDlgArgs.userCancel = false;
  return true;
}

function cancel()
{
  gDlgArgs.userCancel = true;
  return true;
}

