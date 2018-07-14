/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeConstants.js");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");
ChromeUtils.import("resource://clippings/modules/aeString.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");

const NAME_DISPLAY_LEN = 32;

let gDlgArgs = window.arguments[0];
let gStrBundle;
let gClippingsSvc;
let gFolderSelect;
let gFolderItemsList;

let gSortable;
let gSortableOpts = {
  onStart(aEvent)
  {
    aEvent.target.classList.add("dnd-active");
  },

  onEnd(aEvent)
  {
    aEvent.target.classList.remove("dnd-active");

    // Indices need to be 1-based for XPCOM RDF library.
    let oldPos = aEvent.oldIndex + 1;
    let newPos = aEvent.newIndex + 1;

    if (oldPos != newPos) {
      gDlgArgs.rearrangedItems.push({
	parentFolderURI: gFolderSelect.value,
	oldPos,
	newPos
      });
    }
  }
};


function init()
{
  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");
  gClippingsSvc = aeClippingsService.getService();

  gFolderSelect = document.getElementById("folder-picker");
  
  for (let i = 0; i < gDlgArgs.folders.length; i++) {
    let fldr = gDlgArgs.folders[i];
    let fldrOption = document.createElement("option");
    let fldrOptionTxt = document.createTextNode(fldr.name);
    fldrOption.setAttribute("value", fldr.uri);

    if (fldr.uri == gClippingsSvc.kRootFolderURI) {
      fldrOption.classList.add("root-folder");
    }
    
    fldrOption.appendChild(fldrOptionTxt);
    gFolderSelect.appendChild(fldrOption);
  }

  gFolderItemsList = document.getElementById("folder-items");
  gSortable = new Sortable(gFolderItemsList, gSortableOpts);
  populateFolderItemsList(gDlgArgs.folders[0].items);
  
  window.sizeToContent();
}


function populateFolderItemsList(aFolderItems)
{
  for (let item of aFolderItems) {
    let listItem = document.createElement("div");
    let listItemTxt = document.createTextNode(aeString.truncate(item.name, NAME_DISPLAY_LEN));
    listItem.appendChild(listItemTxt);
    
    listItem.className = (item.isFolder ? "folder" : "clipping");

    gFolderItemsList.appendChild(listItem);
  }
}


function changeSelectedFolder()
{
  if (gFolderSelect.options.length > 1) {
    let selectedFldrURI = gFolderSelect.value;

    while (gFolderItemsList.hasChildNodes()) {
      gFolderItemsList.removeChild(gFolderItemsList.firstChild);
    }

    let fldrItems = [];
    for (let i = 0; i < gDlgArgs.folders.length; i++) {
      if (gDlgArgs.folders[i].uri == selectedFldrURI) {
	fldrItems = gDlgArgs.folders[i].items;
	break;
      }
    }

    populateFolderItemsList(fldrItems);
  }
}


function handleKeyPress(aEvent)
{
  if (aEvent.target.tagName == "button") {
    return;
  }
  
  if (aEvent.key == "Enter") {
    accept();
  }
  else if (aEvent.key == "Escape") {
    cancel();
  }
}


function accept()
{
  gDlgArgs.userCancel = false;
  window.close();
}


function cancel()
{
  gDlgArgs.userCancel = true;
  window.close();
}
