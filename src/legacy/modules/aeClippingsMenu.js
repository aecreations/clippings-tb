/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["aeClippingsMenu"];


const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");


let aeClippingsMenu = {
  createInstance(aMenuPopupElt, aClippingsMenuData)
  {
    return new ClippingsMenu(aMenuPopupElt, aClippingsMenuData);
  }
};


class ClippingsMenu
{
  constructor(aMenuPopupElt, aClippingsMenuData)
  {
    this._menuPopupElt = aMenuPopupElt;
    this._fnMenuItemCmd = function () {};
    this._clippingsMenuData = aClippingsMenuData;
    this._doc = aMenuPopupElt.ownerDocument;
  }

  set menuItemCommand(aFnMenuItemCmd)
  {
    this._fnMenuItemCmd = aFnMenuItemCmd;
  }

  set data(aClippingsMenuData)
  {
    this._clippingsMenuData = aClippingsMenuData;
  }

  build()
  {
    aeUtils.log("aeClippingsMenu.build(): Building Clippings menu");
    this._buildHelper(this._menuPopupElt, this._clippingsMenuData);
  }

  _buildHelper(aMenuPopupElt, aMenuData)
  {
    for (let i = 0; i < aMenuData.length; i++) {
      let item = aMenuData[i];

      if (item.submenuItems) {
	let menuElt = this._doc.createXULElement("menu");
	menuElt.classList.add("menu-iconic", "ae-clippings-folder-menu");
	/***
	if (item.uri == this._clippingsSvc.kSyncFolderURI) {
	  menuElt.classList.add("ae-clippings-sync-folder");
	}
	***/
	menuElt.setAttribute("label", item.title);

	let menuPopupElt = this._doc.createXULElement("menupopup");
	this._buildHelper(menuPopupElt, item.submenuItems);
	menuElt.appendChild(menuPopupElt);
        aMenuPopupElt.appendChild(menuElt);
      }
      else {
	let menuItemElt = this._doc.createXULElement("menuitem");
	menuItemElt.classList.add("menuitem-iconic", "ae-clippings-clipping");
	menuItemElt.setAttribute("label", item.title);
	menuItemElt.setAttribute("data-clipping-menuitem-id", item.id);
	menuItemElt.addEventListener("command", aEvent => {
	  this._fnMenuItemCmd(aEvent);
	});

	if ("label" in item) {
	  menuItemElt.setAttribute("data-clipping-label", item.label);
	}

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
