/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://clippings/modules/aeConstants.js");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");
ChromeUtils.import("resource://clippings/modules/aeString.js");
ChromeUtils.import("resource://clippings/modules/aeClippingsService.js");

let gDlgArgs = window.arguments[0];
let gStrBundle;
let gClippingsSvc;


function init()
{
  gStrBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");
  gClippingsSvc = aeClippingsService.getService();

  document.allowUnsafeHTML = true;  // Doesn't do anything
  buildClippingsTree();

  window.sizeToContent();
}


function buildClippingsTree()
{
  let treeData = buildClippingsTreeHelper();

  if (treeData.length == 0) {
    // TO DO: Set empty clippings state
  }
  
  $("#clippings-tree").fancytree({
    extensions: ["dnd5"],

    debugLevel: 0,
    autoScroll: true,
    source: treeData,
    selectMode: 1,
    
    icon: true,

    init(aEvent, aData) {
      let rootNode = aData.tree.getRootNode();
      if (rootNode.children.length > 0) {
	rootNode.children[0].setActive();
      }
    },

    activate(aEvent, aData) {
      aeUtils.log("clipMgrDnD.js: Activate event fired on clippings tree");
    },

    dblclick(aEvent, aData) {
      aeUtils.log("clipMgrDnD.js: Double-click event fired on clippings tree");
    },

    dnd5: {
      preventRecursiveMoves: true,
      preventVoidMoves: true,
      scroll: true,

      dragStart(aNode, aData) {
	return true;
      },

      dragEnter(aNode, aData) {
	if (! aNode.isFolder()) {
	  // Prevent attempt to drop a node into a non-folder node; in such a
	  // case, only allow reordering of nodes.
	  return ["before", "after"];
	}

	aData.dataTransfer.dropEffect = "move";
	return true;
      },

      dragDrop(aNode, aData) {
	if (aData.otherNode) {
	  // Prevent dropping a node into a non-folder node.
	  if (!aNode.isFolder() && aDate.hitMode == "over") {
	    return;
	  }

	  // TO DO: Finish implementation.
	}
      },
    }
  });
}


function buildClippingsTreeHelper(aFolderData)
{
  let rv = [];
  let clippingsData;

  if (! aFolderData) {
    clippingsData = JSON.parse(gClippingsSvc.exportToJSONString());
  }
  else {
    clippingsData = aFolderData;
  }
  
  for (let i = 0; i < clippingsData.length; i++) {
    let item = clippingsData[i];

    if (item.children) {
      let folderNode = {
	key: item.uri,
	title: item.name,
	folder: true
      };

      let childNodes = buildClippingsTreeHelper(item.uri);
      folderNode.children = childNodes;
      rv.push(folderNode);
    }
    else {
      let clippingNode = {
	key: item.uri,
	title: item.name
      };

      if (item.label) {
	clippingNode.extraClasses = `ae-clipping-label-${item.label}`;
      }

      rv.push(clippingNode);
    }
  }
  
  return rv;
}


function accept()
{
  // TO DO: Implement dialog action when user clicks OK button.
  
  window.close();
}


function cancel()
{
  gDlgArgs.userCancel = true;
  window.close();
}
