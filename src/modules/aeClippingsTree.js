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
    this._tree = aTreeElt;
    this._fldrOnly = false;
    this._showRootFldr = false;
    this._rootFldrTitle = "Clippings";
    this._clippingsSvc = aeClippingsService.getService();
    this._doc = aTreeElt.ownerDocument;
  }

  get tree()
  {
    return this._tree;
  }

  set tree(aTreeElt)
  {
    return (this._tree = aTreeElt);
  }

  get foldersOnly()
  {
    return this._fldrOnly;
  }

  set foldersOnly(aFoldersOnly)
  {
    return (this._fldrOnly = aFoldersOnly);
  }

  get showRootFolder()
  {
    return this._showRootFldr;
  }

  set showRootFolder(aShowRootFolder)
  {
    return (this._showRootFldr = aShowRootFolder);
  }
  
  build()
  {
    let clippingsJSONStr = this._clippingsSvc.exportToJSONString();
    let clippingsJSON = JSON.parse(clippingsJSONStr);

    aeUtils.log("aeClippingsTree.build(): Building Clippings tree");

    let treechildrenRoot = this._doc.createElement("treechildren");

    if (this._showRootFldr) {
      let rootTreeitem = this._doc.createElement("treeitem");
      rootTreeitem.setAttribute("container", "true");
      rootTreeitem.setAttribute("open", "true");
      rootTreeitem.setAttribute("data-uri", this._clippingsSvc.kRootFolderURI);

      let rootTreerow = this._doc.createElement("treerow");
      let rootTreecell = this._doc.createElement("treecell");
      rootTreecell.setAttribute("label", this._rootFldrTitle);
      rootTreecell.setAttribute("properties", "root");
      rootTreerow.appendChild(rootTreecell);
      rootTreeitem.appendChild(rootTreerow);

      let nestedTreechildren = this._doc.createElement("treechildren");
      this._buildHelper(nestedTreechildren, clippingsJSON);

      rootTreeitem.appendChild(nestedTreechildren);
      treechildrenRoot.appendChild(rootTreeitem);
      this._tree.appendChild(treechildrenRoot);
    }
    else {
      this._buildHelper(treechildrenRoot, clippingsJSON);
      this._tree.appendChild(treechildrenRoot);
    }
  }

  _buildHelper(aTreechildrenElt, aFolderItems)
  {
    for (let i = 0; i < aFolderItems.length; i++) {
      let item = aFolderItems[i];
      
      if (item.children) {
	let treeitem = this._doc.createElement("treeitem");
	treeitem.setAttribute("data-uri", item.uri);
	treeitem.setAttribute("container", "true");
	
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
	if (this._fldrOnly) {
	  continue;
	}
	
	let treeitem = this._doc.createElement("treeitem");
	treeitem.setAttribute("data-uri", item.uri);
	
	let treerow = this._doc.createElement("treerow");
	let treecell = this._doc.createElement("treecell");
	treecell.setAttribute("label", item.name);
	if (item.label) {
	  treecell.setAttribute("properties", item.label);
	}
	
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
    let treechildrenElt = this._tree.childNodes[1];

    while (treechildrenElt.hasChildNodes()) {
      let lastChild = treechildrenElt.lastChild;
      treechildrenElt.removeChild(lastChild);
    }

    this._tree.removeChild(treechildrenElt);
  }

  click()
  {
    this._tree.click();
  }

  focus()
  {
    this._tree.focus();
  }

  get selectedIndex()
  {
    return this._tree.currentIndex;
  }

  set selectedIndex(aIndex)
  {
    return (this._tree.view.selection.select(aIndex));
  }

  get selectedURI()
  {
    let rv = "";
    let idx = this._tree.currentIndex;
    if (idx != -1) {
      let treeitem = this._tree.view.getItemAtIndex(idx);
      if (treeitem) {
	rv = treeitem.getAttribute("data-uri");
      }
    }
    return rv;
  }

  set selectedURI(aURI)
  {
    let treeitems = this._tree.getElementsByTagName("treeitem");
    for (let i = 0; i < treeitems.length; i++) {
      let uri = treeitems[i].getAttribute("data-uri");
      if (uri == aURI) {
	let idx = this._tree.view.getIndexOfItem(treeitems[i]);
	this.selectedIndex = idx;
	break;
      }
    }
  }

  ensureURIIsVisible(aURI)
  {
    let treeitems = this._tree.getElementsByTagName("treeitem");
    let idx = -1;
    let treeitem;

    for (let i = 0; i < treeitems.length; i++) {
      let uri = treeitems[i].getAttribute("data-uri");
      if (uri == aURI) {
	idx = this._tree.view.getIndexOfItem(treeitems[i]);
	treeitem = treeitems[i];
	break;
      }
    }

    if (idx != -1) {
      this.ensureIndexIsVisible(idx);
    }

    if (treeitem) {
      this._expandParentsOfNode(aURI);
    }
  }

  _expandParentsOfNode(aURI)
  {
    let pathToNode = [];
    let parentFolderURI = this._clippingsSvc.getParent(aURI);
    while (parentFolderURI != this._clippingsSvc.kRootFolderURI) {
      pathToNode.unshift(parentFolderURI);
      parentFolderURI = this._clippingsSvc.getParent(parentFolderURI);
    }

    // Go through the `pathToNode' array and expand the tree rows of the
    // folders that are currently collapsed.
    for (let i = 0; i < pathToNode.length; i++) {
      let idx = this.getIndexAtURI(pathToNode[i]);
      if (! this._tree.view.isContainerOpen(idx)) {
        this._tree.view.toggleOpenState(idx);
      }
    }
  }

  ensureIndexIsVisible(aIndex)
  {
    this._tree.treeBoxObject.ensureRowIsVisible(aIndex);    
  }

  getRowCount()
  {
    return this._tree.view.rowCount;
  }

  getURIAtIndex(aIndex)
  {
    let rv = "";
    let treeitem = this._tree.view.getItemAtIndex(aIndex);
    if (treeitem) {
      rv = treeitem.getAttribute("data-uri");
    }
    return rv;
  }

  getIndexAtURI(aURI)
  {
    let rv = -1;
    let treeitems = this._tree.getElementsByTagName("treeitem");

    for (let i = 0; i < treeitems.length; i++) {
      let uri = treeitems[i].getAttribute("data-uri");
      if (uri == aURI) {
	rv = this._tree.view.getIndexOfItem(treeitems[i]);
	break;
      }
    }
    return rv;
  }

  addLeafNode(aParentNodeURI, aLeafNodeURI, aLeafNodeLabel)
  {
    if (aParentNodeURI == this._clippingsSvc.kRootFolderURI) {
      let treechildrenRoot = this._tree.childNodes[1];
      this._addLeafNodeHelper(treechildrenRoot, aLeafNodeURI, aLeafNodeLabel);
      return;
    }
    
    let treeitems = this._tree.getElementsByTagName("treeitem");

    for (let i = 0; i < treeitems.length; i++) {
      let treeitem = treeitems[i];
      let uri = treeitem.getAttribute("data-uri");
      if (uri == aParentNodeURI && treeitem.hasAttribute("container")) {
	treeitem.setAttribute("open", "true");
	let treechildren = treeitem.childNodes[1];
	if (treechildren) {
	  this._addLeafNodeHelper(treechildren, aLeafNodeURI, aLeafNodeLabel);
	}
	else {
	  treechildren = this._doc.createElement("treechildren");
	  this._addLeafNodeHelper(treechildren, aLeafNodeURI, aLeafNodeLabel);
	  treeitem.appendChild(treechildren);
	}
	break;
      }
    }
  }

  addFolderNode(aParentNodeURI, aFolderNodeURI, aFolderLabel)
  {
    if (aParentNodeURI == this._clippingsSvc.kRootFolderURI) {
      let treechildrenRoot = this._tree.childNodes[1];
      this._addLeafNodeHelper(treechildrenRoot, aFolderNodeURI, aFolderLabel, true);
      return;
    }
    
    let treeitems = this._tree.getElementsByTagName("treeitem");

    for (let i = 0; i < treeitems.length; i++) {
      let treeitem = treeitems[i];
      let uri = treeitem.getAttribute("data-uri");
      if (uri == aParentNodeURI && treeitem.hasAttribute("container")) {
	treeitem.setAttribute("open", "true");
	let treechildren = treeitem.childNodes[1];
	if (treechildren) {
	  this._addLeafNodeHelper(treechildren, aFolderNodeURI, aFolderLabel, true);
	}
	else {
	  treechildren = this._doc.createElement("treechildren");
	  this._addLeafNodeHelper(treechildren, aFolderNodeURI, aFolderLabel, true);
	  treeitem.appendChild(treechildren);
	}
	break;
      }
    }
  }

  _addLeafNodeHelper(aTreechildrenElt, aLeafNodeURI, aLeafNodeLabel, aIsFolder)
  {
    let treeitem = this._doc.createElement("treeitem");
    treeitem.setAttribute("data-uri", aLeafNodeURI);
    if (aIsFolder) {
      treeitem.setAttribute("container", "true");
    }
    
    let treerow = this._doc.createElement("treerow");
    let treecell = this._doc.createElement("treecell");
    treecell.setAttribute("label", aLeafNodeLabel);
    treerow.appendChild(treecell);
    treeitem.appendChild(treerow);
    aTreechildrenElt.appendChild(treeitem);   
  }

  removeNode(aNodeURI)
  {
    let treeitems = this._tree.getElementsByTagName("treeitem");
    let targetNode;

    for (let i = 0; i < treeitems.length; i++) {
      let treeitem = treeitems[i];
      let uri = treeitem.getAttribute("data-uri");
      if (uri == aNodeURI) {
	targetNode = treeitem;
	break;
      }
    }

    if (targetNode) {
      let parentNode = targetNode.parentNode;
      parentNode.removeChild(targetNode);
    }
  }
  
  setNodeTitle(aNodeURI, aLabel)
  {
    let treeitems = this._tree.getElementsByTagName("treeitem");

    for (let i = 0; i < treeitems.length; i++) {
      let treeitem = treeitems[i];
      let uri = treeitem.getAttribute("data-uri");
      if (uri == aNodeURI) {
	let treerow = treeitem.firstChild;
	if (treerow) {
	  let treecell = treerow.firstChild;
	  if (treecell) {
	    treecell.setAttribute("label", aLabel);
	  }
	}
	break;
      }
    }
  }

  setNodeProperty(aNodeURI, aProperty)
  {
    let treeitems = this._tree.getElementsByTagName("treeitem");

    for (let i = 0; i < treeitems.length; i++) {
      let treeitem = treeitems[i];
      let uri = treeitem.getAttribute("data-uri");
      if (uri == aNodeURI) {
	let treerow = treeitem.firstChild;
	if (treerow) {
	  let treecell = treerow.firstChild;
	  if (treecell) {
	    treecell.setAttribute("properties", aProperty);
	  }
	}
	break;
      }
    }
  }
}
