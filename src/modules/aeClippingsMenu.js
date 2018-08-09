/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["aeClippingsMenu"];


ChromeUtils.import("resource://clippings/modules/aeUtils.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");


let aeClippingsMenu = {
  createInstance(aMenuPopupElt)
  {
    return new ClippingsMenu(aMenuPopupElt);
  }
};


class ClippingsMenu
{
  constructor(aMenuPopupElt)
  {
    this._menuPopupElt = aMenuPopupElt;
    this._fnMenuItemCmd = function () {};
    this._clippingsSvc = aeClippingsService.getService();
    this._doc = aMenuPopupElt.ownerDocument;
  }

  set menuItemCommand(aFnMenuItemCmd)
  {
    this._fnMenuItemCmd = aFnMenuItemCmd;
  }

  build()
  {
    let clippingsJSONStr = this._clippingsSvc.exportToJSONString();
    let clippingsJSON = JSON.parse(clippingsJSONStr);

    aeUtils.log("aeClippingsMenu.build(): Building Clippings menu");
    this._buildHelper(this._menuPopupElt, clippingsJSON);
  }

  _buildHelper(aMenuPopupElt, aFolderItems)
  {
    for (let i = 0; i < aFolderItems.length; i++) {
      let item = aFolderItems[i];
      
      if (item.children) {
        //aeUtils.log("Creating <menu> for folder '" + item.name + "'");
	let menuElt = this._doc.createElement("menu");
	menuElt.classList.add("menu-iconic", "ae-clippings-folder-menu");
	if (item.uri == this._clippingsSvc.kSyncFolderURI) {
	  menuElt.classList.add("ae-clippings-sync-folder");
	}
	
	menuElt.setAttribute("label", item.name);

	let menuPopupElt = this._doc.createElement("menupopup");
	this._buildHelper(menuPopupElt, item.children);
	menuElt.appendChild(menuPopupElt);
        aMenuPopupElt.appendChild(menuElt);
      }
      else {
        //aeUtils.log("Creating <menuitem> for clipping '" + item.name + "'");
	let menuItemElt = this._doc.createElement("menuitem");
	menuItemElt.classList.add("menuitem-iconic", "ae-clippings-clipping");
	menuItemElt.setAttribute("label", item.name);
	menuItemElt.setAttribute("data-clipping-uri", item.uri);
        menuItemElt.setAttribute("data-clipping-label", item.label);
	menuItemElt.addEventListener("command", aEvent => {
	  this._fnMenuItemCmd(aEvent);
	}, false);

	aMenuPopupElt.appendChild(menuItemElt);
      }
    }
  }

  rebuild()
  {
    aeUtils.log("aeClippingsMenu.rebuild(): Rebuilding Clippings menu");
    this._removeAll();
    this.build();
  }

  _removeAll()
  {
    while (this._menuPopupElt.hasChildNodes()) {
      let lastChild = this._menuPopupElt.lastChild;

      if (lastChild.nodeName == "menuseparator") {
	break;
      }

      this._menuPopupElt.removeChild(lastChild);
    }
  }
}
