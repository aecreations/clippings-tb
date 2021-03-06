/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
const {aeClippingsService} = ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");
const {aeClippingsTree} = ChromeUtils.import("resource://clippings/modules/aeClippingsTree.js");

let gDlgArgs;
let gStrBundle;
let gClippingsSvc;
let gFolderTree;


function $(aID)
{
  return document.getElementById(aID);
}


function init()
{
  gDlgArgs = window.arguments[0];

  try {
    gClippingsSvc = aeClippingsService.getService();
  }
  catch (e) {
    alert(e);
    window.close();
  }

  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  gFolderTree = aeClippingsTree.createInstance($("folder-tree"));
  gFolderTree.foldersOnly = true;
  gFolderTree.showRootFolder = true;
  gFolderTree.build();
  gFolderTree.selectedIndex = 0;
  
  document.addEventListener("dialogaccept", aEvent => {
    if (! accept()) {
      aEvent.preventDefault();
    }
  });
  document.addEventListener("dialogcancel", aEvent => { cancel() });
}


function accept()
{
  if (gFolderTree.selectedIndex == -1) {
    aeUtils.beep();
    return false;
  }

  gDlgArgs.createCopy = $("create-copy").checked;
  gDlgArgs.destFolderURI = gFolderTree.selectedURI;

  gDlgArgs.userCancel = false;
  return true;
}


function cancel()
{
  gDlgArgs.userCancel = true;
  return true;
}
