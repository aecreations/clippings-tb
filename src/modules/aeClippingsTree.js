/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["aeClippingsTree"];


ChromeUtils.import("resource://clippings/modules/aeUtils.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");


let aeClippingsTree = {
  createInstance(aTreeElt)
  {
    return new ClippingsTree(aTreeElt);
  }
};


class ClippingsTree
{
  constructor(aTreeElt)
  {
    this._treeElt = aTreeElt;
    this._clippingsSvc = aeClippingsService.getService();
    this._doc = aTreeElt.ownerDocument;
  }

  build()
  {
    let clippingsJSONStr = this._clippingsSvc.exportToJSONString();
    let clippingsJSON = JSON.parse(clippingsJSONStr);

    aeUtils.log("aeClippingsTree.build(): Building Clippings tree");

    let treechildrenRoot = this._doc.createElement("treechildren");
    this._buildHelper(treechildrenRoot, clippingsJSON);

    this._treeElt.appendChild(treechildrenRoot);
  }

  _buildHelper(aTreechildrenElt, aFolderItems)
  {
    for (let i = 0; i < aFolderItems.length; i++) {
      let item = aFolderItems[i];
      
      if (item.children) {
        //aeUtils.log("Creating element for folder '" + item.name + "'");
	let treeitem = this._doc.createElement("treeitem");
	treeitem.setAttribute("container", "true");
	treeitem.setAttribute("data-folder-uri", item.uri);
	
	let treerow = this._doc.createElement("treerow");
	let treecell = this._doc.createElement("treecell");
	treecell.setAttribute("label", item.name);
	treerow.appendChild(treecell);
	treeitem.appendChild(treerow);

	let treechildrenNested = this._doc.createElement("treechildren");
	this._buildHelper(treechildrenNested, item.children);
	treeitem.appendChild(treechildrenNested);
	aTreechildrenElt.appendChild(treeitem);
      }
      else {
        //aeUtils.log("Creating element for clipping '" + item.name + "'");
	let treeitem = this._doc.createElement("treeitem");
	treeitem.setAttribute("data-clipping-uri", item.uri);
	
	let treerow = this._doc.createElement("treerow");
	let treecell = this._doc.createElement("treecell");
	treecell.setAttribute("label", item.name);
	treerow.appendChild(treecell);
	treeitem.appendChild(treerow);
	aTreechildrenElt.appendChild(treeitem);
      }
    }
  }

  rebuild()
  {
    aeUtils.log("aeClippingsTree.rebuild(): Rebuilding Clippings tree");
    this._removeAll();
    this.build();
  }

  _removeAll()
  {
    while (this._treeElt.hasChildNodes()) {
      let lastChild = this._treeElt.lastChild;
      this._treeElt.removeChild(lastChild);
    }
  }
}
