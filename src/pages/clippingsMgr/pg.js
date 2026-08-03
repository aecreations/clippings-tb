/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEBUG_TREE = false;
const DEBUG_WND_ACTIONS = false;
const REBUILD_BRWS_CXT_MENU_DELAY = 3000;
const ENABLE_PASTE_CLIPPING = false;

let gEnvInfo;
let gClippingsDB;
let gPrefs;
let gIsClippingsTreeEmpty;
let gDialogs = {};
let gOpenerWndID;
let gIsMaximized;
let gSuppressAutoMinzWnd;
let gSyncedItemsIDs = new Set();
let gSyncedItemsIDMap = new Map();
let gIsBackupMode = false;
let gErrorPushSyncItems = false;
let gReorderedTreeNodeNextSibling = null;
let gWndID;

let gPermissionReq = {
  _extPerm: null,
  _execActionID: null,

  set(aExtPermission, aExecActionID)
  {
    this._extPerm = aExtPermission;
    this._execActionID = aExecActionID;
  },

  get()
  {
    let rv = {
      extPerm: this._extPerm,
      execActionID: this._execActionID,
    };
    return rv;
  },

  clear()
  {
    this._extPerm = null;
    this._execActionID = null;
  },
};


// Wrappers to database create/update/delete operations. These also call the
// Clippings listeners upon completion of the database operations.
let gClippingsSvc = {
  async createClipping(aClippingData)
  {
    let newClippingID = await gClippingsDB.clippings.add(aClippingData);
    gClippingsListener.newClippingCreated(newClippingID, aClippingData, aeConst.ORIGIN_CLIPPINGS_MGR);
    messenger.runtime.sendMessage({
      msgID: "new-clipping-created",
      newClippingID,
      newClipping: aClippingData,
      origin: aeConst.ORIGIN_CLIPPINGS_MGR,
    });

    return newClippingID;
  },

  async createFolder(aFolderData)
  {
    let newFolderID = await gClippingsDB.folders.add(aFolderData);
    gClippingsListener.newFolderCreated(newFolderID, aFolderData, aeConst.ORIGIN_CLIPPINGS_MGR);
    messenger.runtime.sendMessage({
      msgID: "new-folder-created",
      newFolderID,
      newFolder: aFolderData,
      origin: aeConst.ORIGIN_CLIPPINGS_MGR,
    });

    return newFolderID;
  },

  async updateClipping(aClippingID, aChanges, aOldClipping)
  {
    if (! aOldClipping) {
      aOldClipping = await gClippingsDB.clippings.get(aClippingID);
    }
    let numUpd = await gClippingsDB.clippings.update(aClippingID, aChanges);

    let newClipping = {};
    let keys = Object.keys(aOldClipping);
    for (let key of keys) {
      if (key in aChanges) {
        newClipping[key] = aChanges[key];
      }
      else {
        newClipping[key] = aOldClipping[key];
      }
    }        

    gClippingsListener.clippingChanged(aClippingID, newClipping, aOldClipping);
    messenger.runtime.sendMessage({
      msgID: "clipping-changed",
      clippingID: aClippingID,
      clippingData: newClipping,
      oldClippingData: aOldClipping,
    });

    return numUpd;
  },

  async updateFolder(aFolderID, aChanges, aOldFolder)
  {
    if (! aOldFolder) {
      aOldFolder = await gClippingsDB.folders.get(aFolderID);
    }
    let numUpd = await gClippingsDB.folders.update(aFolderID, aChanges);

    let newFolder = {};
    let keys = Object.keys(aOldFolder);
    for (let key of keys) {
      if (key in aChanges) {
        newFolder[key] = aChanges[key];
      }
      else {
        newFolder[key] = aOldFolder[key];
      }
    }        

    gClippingsListener.folderChanged(aFolderID, newFolder, aOldFolder);
    messenger.runtime.sendMessage({
      msgID: "folder-changed",
      folderID: aFolderID,
      folderData: newFolder,
      oldFolderData: aOldFolder,
    });

    return numUpd;
  },

  async deleteClipping(aClippingID)
  {
    await gClippingsDB.clippings.delete(aClippingID);
  },

  async deleteFolder(aFolderID)
  {
    await gClippingsDB.folders.delete(aFolderID);
  }
};


// Clippings listener object
let gClippingsListener = {
  _isCopying:   false,

  origin: aeConst.ORIGIN_CLIPPINGS_MGR,
  copiedItems: [],
  
  newClippingCreated: function (aID, aData, aOrigin, aDontSelect)
  {
    if (this._isCopying) {
      return;
    }
    
    if (gIsClippingsTreeEmpty) {
      unsetEmptyClippingsState();
    }

    let tree = getClippingsTree();
    let selectedNode = tree.activeNode;
    let newNodeData = {
      key: aID + "C",
      title: sanitizeTreeNodeTitle(DEBUG_TREE ? `${aData.name} [key=${aID}C]` : aData.name)
    };

    let newNode = null;

    if (selectedNode) {
      if (aData.parentFolderID == aeConst.ROOT_FOLDER_ID) {
        if (aData.separator) {
          let childNodes = tree.rootNode.getChildren();
          // For separators only:
          // Need to subtract 1 from display order due to starting index of 1
          // for the root folder to accommodate the Synced Clippings folder.
          let idx = aData.displayOrder - 1;
          idx < 0 && (idx = 0);
          newNodeData.title = "<hr>";
          let siblingNode = childNodes[idx];
          newNode = siblingNode.appendSibling(newNodeData);
        }
        else {
          newNode = tree.rootNode.addNode(newNodeData);
        }
      }
      else {
        let parentNode = tree.getNodeByKey(aData.parentFolderID + "F");
        if (aData.separator) {
          let childNodes = parentNode.getChildren();
          let idx = aData.displayOrder;
          idx < 0 && (idx = 0);
          newNodeData.title = "<hr>";
          let siblingNode = childNodes[idx];
          newNode = siblingNode.appendSibling(newNodeData)
        }
        else {
          newNode = parentNode.addNode(newNodeData);
        }
      }
    }
    else {
      // No clippings or folders.
      newNode = tree.rootNode.addNode(newNodeData);
    }

    if (aData.label) {
      newNode.addClass(`ae-clipping-label-${aData.label}`);
    }

    if (aData.separator) {
      newNode.addClass("ae-separator");
    }

    if (aDontSelect) {
      return;
    }

    let newClipping = {
      id: aData.id,
      name: aData.name,
      parentFolderID: aData.parentFolderID,
    };

    newNode.makeVisible().done(() => {     
      newNode.setActive();
      $("#clipping-name").val(newClipping.name).trigger("focus").trigger("select");
      $("#clipping-text").val('');

      // Clipping created outside Clippings Manager. Add to undo stack.
      if (aOrigin == aeConst.ORIGIN_HOSTAPP) {
        let state = {
          action: gCmd.ACTION_CREATENEW,
          id: newClipping.id,
          itemType: gCmd.ITEMTYPE_CLIPPING,
          parentFldrID: newClipping.parentFolderID,
        };

        if (gPrefs.syncClippings) {
          // BUG!!  "Dead object" error thrown from aData, because the
          // New Clipping dialog, where the aData parameter is populated from,
          // will be closed by the time these lines are reached.
          if ("sid" in aData) {
            state.sid = aData.sid;
          }
          if ("parentFldrSID" in aData) {
            state.parentFldrSID = aData.parentFldrSID;
          }
        }
        
        gCmd.undoStack.push(state);
      }
    });
  },

  newFolderCreated: function (aID, aData, aOrigin, aDontSelect)
  {
    if (this._isCopying) {
      return;
    }
    
    if (gIsClippingsTreeEmpty) {
      unsetEmptyClippingsState();
    }
    
    let tree = getClippingsTree();
    let selectedNode = tree.activeNode;
    let newNodeData = {
      key: aID + "F",
      title: sanitizeTreeNodeTitle(DEBUG_TREE ? `${aData.name} [key=${aID}F]` : aData.name),
      folder: true,
      children: []
    };

    if (aID == gPrefs.syncFolderID) {
      newNodeData.extraClasses = "ae-synced-clippings-fldr";
      if (gPrefs.isSyncReadOnly) {
        newNodeData.extraClasses += " ae-synced-clippings-readonly";
      }
    }

    let newNode = null;
    
    if (selectedNode) {
      if (aData.parentFolderID == aeConst.ROOT_FOLDER_ID) {
        newNode = tree.rootNode.addNode(newNodeData);
      }
      else {
        let parentNode = tree.getNodeByKey(aData.parentFolderID + "F");
        newNode = parentNode.addNode(newNodeData);
      }
    }
    else {
      // No clippings or folders.
      newNode = tree.rootNode.addNode(newNodeData);
    }

    if (aDontSelect) {
      return;
    }

    let newFolder = {
      id: aData.id,
      name: aData.name,
      parentFolderID: aData.parentFolderID,
    };

    newNode.makeVisible().done(() => {
      newNode.setActive();
      $("#clipping-name").val(newFolder.name).trigger("focus").trigger("select");
      $("#clipping-text").val('');

      // Folder created outside Clippings Manager. Add to undo stack.
      if (aOrigin == aeConst.ORIGIN_HOSTAPP) {
        let state = {
          action: gCmd.ACTION_CREATENEWFOLDER,
          id: newFolder.id,
          itemType: gCmd.ITEMTYPE_FOLDER,
          parentFldrID: newFolder.parentFolderID,
        };

        if (gPrefs.syncClippings) {
          if ("sid" in aData) {
            state.sid = aData.sid;
          }
          if ("parentFldrSID" in aData) {
            state.parentFldrSID = aData.parentFldrSID;
          }
        }
        
        gCmd.undoStack.push(state);
      }
    });
  },

  clippingChanged: function (aID, aData, aOldData)
  {
    let tree = getClippingsTree();

    if (aData.parentFolderID != aOldData.parentFolderID) {
      let oldParentFldrID = aOldData.parentFolderID;
      let newParentFldrID = aData.parentFolderID;

      if (this._isFlaggedForDelete(aData)) {
        this._removeClippingsTreeNode(aID + "C");
        gCmd.updateDisplayOrder(oldParentFldrID, null, null, true);
      }
      else {
        log("Clippings: clippingsMgr/pg.js::gClippingsListener.clippingChanged(): Handling clipping move");
        let changedNode = tree.getNodeByKey(aID + "C");
        if (changedNode) {
          let targParentNode;
          if (aData.parentFolderID == aeConst.ROOT_FOLDER_ID) {
            targParentNode = tree.rootNode;
          }
          else {
            targParentNode = tree.getNodeByKey(aData.parentFolderID + "F");
          }
          
          changedNode.moveTo(targParentNode, "child");

          log("Clippings: clippingsMgr/pg.js: gCmd.clippingChanged(): Updating display order of changed clipping");
          gCmd.updateDisplayOrder(oldParentFldrID, null, null, true).then(() => {
            gCmd.updateDisplayOrder(newParentFldrID, null, null, true);
          });
        }
        else {
          // Undoing delete.
          let newNodeData = {
            key: aID + "C",
            title: sanitizeTreeNodeTitle(DEBUG_TREE ? `${aData.name} [key=${aID}C]` : aData.name)
          };

          if (aData.separator) {
            newNodeData.extraClasses = "ae-separator";
            newNodeData.title = "<hr>";
            if (aData.parentFolderID == aeConst.ROOT_FOLDER_ID) {
              // Position the separator node in the tree list.
              // For the root folder, displayOrder starts at 1 to accommodate
              // the Synced Clippings folder.
              let rootNodes = tree.rootNode.getChildren();
              let sibling = rootNodes[aData.displayOrder];
              if (sibling) {
                changedNode = sibling.addNode(newNodeData, "before");
              }
              else {
                // The given displayOrder is invalid.
                sibling = tree.rootNode.getLastChild();
                changedNode = sibling.appendSibling(newNodeData);
              }
            }
            else {
              let parentNode = tree.getNodeByKey(aData.parentFolderID + "F");
              let fldrNodes = parentNode.getChildren();
              let sibling = fldrNodes[aData.displayOrder + 1];
              if (sibling) {
                changedNode = sibling.addNode(newNodeData, "before");
              }
              else {
                sibling = parentNode.getLastChild();
                changedNode = sibling.appendSibling(newNodeData);
              }
            }
          }
          else {
            if (aData.parentFolderID == aeConst.ROOT_FOLDER_ID) {
              changedNode = tree.rootNode.addNode(newNodeData);
            }
            else {
              let parentNode = tree.getNodeByKey(aData.parentFolderID + "F");
              changedNode = parentNode.addNode(newNodeData);
            }

            if (aData.label) {
              changedNode.addClass(`ae-clipping-label-${aData.label}`);
            }

            log(`Clippings: clippingsMgr/pg.js: gCmd.clippingChanged(): Updating display order of items under folder (ID = ${newParentFldrID}) after undoing clipping deletion`);
            gCmd.updateDisplayOrder(newParentFldrID, null, null, true);
          }
        }

        changedNode.makeVisible().then(() => { changedNode.setActive() });
      }
    }
    else if (aData.name != aOldData.name) {
      let changedNode = tree.getNodeByKey(aID + "C");
      changedNode.setTitle(sanitizeTreeNodeTitle(aData.name));
    }
  },

  folderChanged: function (aID, aData, aOldData)
  {
    let tree = getClippingsTree();

    if (aData.parentFolderID != aOldData.parentFolderID) {
      let oldParentFldrID = aOldData.parentFolderID;
      let newParentFldrID = aData.parentFolderID;

      if (this._isFlaggedForDelete(aData)) {
        this._removeClippingsTreeNode(aID + "F");
        gCmd.updateDisplayOrder(oldParentFldrID, null, null, true);
      }
      else {
        log("Clippings: clippingsMgr/pg.js::gClippingsListener.folderChanged: Handling folder move");
        let changedNode = tree.getNodeByKey(aID + "F");
        if (changedNode) {
          let targParentNode;
          if (aData.parentFolderID == aeConst.ROOT_FOLDER_ID) {
            targParentNode = tree.rootNode;
          }
          else {
            targParentNode = tree.getNodeByKey(aData.parentFolderID + "F");
          }
          
          changedNode.moveTo(targParentNode, "child");

          log("Clippings: clippingsMgr/pg.js: gCmd.folderChanged(): Updating display order of changed folder");
          let newParentFldrID = aData.parentFolderID;
          gCmd.updateDisplayOrder(oldParentFldrID, null, null, true).then(() => {
            gCmd.updateDisplayOrder(newParentFldrID, null, null, true);
          });
        }
        else {
          // Undoing delete.
          let newNodeData = {
            key: aID + "F",
            title: sanitizeTreeNodeTitle(DEBUG_TREE ? `${aData.name} [key=${aID}C]` : aData.name),
            folder: true,
            children: []
          };

          if (aData.parentFolderID == aeConst.ROOT_FOLDER_ID) {
            changedNode = tree.rootNode.addNode(newNodeData);
          }
          else {
            let parentNode = tree.getNodeByKey(aData.parentFolderID + "F");
            changedNode = parentNode.addNode(newNodeData);
          }

          log("Clippings: clippingsMgr/pg.js: gCmd.folderChanged(): Updating display order after undoing folder deletion");
          gCmd.updateDisplayOrder(newParentFldrID, null, null, true).then(() => {
            this._buildChildNodes(changedNode);
          });
        }
        changedNode.makeVisible().then(() => { changedNode.setActive() });
      }
    }
    else if (aData.name != aOldData.name) {
      let changedNode = tree.getNodeByKey(aID + "F");
      changedNode.setTitle(sanitizeTreeNodeTitle(aData.name));
    }
  },

  clippingDeleted: function (aID, aOldData) {},
  folderDeleted: function (aID, aOldData) {},
  dndMoveStarted: function () {},
  dndMoveFinished: function () {},
  
  copyStarted: function ()
  {
    this._isCopying = true;
  },

  copyFinished: function (aItemCopyID)
  {
    info("Clippings: clippingsMgr/pg.js: gClippingsListener.copyFinished()");
       
    this._isCopying = false;
    
    for (let i = 0; i < this.copiedItems.length; i++) {
      let item = this.copiedItems[i];
      if (item.itemType == gCmd.ITEMTYPE_FOLDER) {
        let suppressFldrSelect = true;
        if (item.id == aItemCopyID) {
          suppressFldrSelect = false;
        }
        this.newFolderCreated(item.id, item, aeConst.ORIGIN_CLIPPINGS_MGR, suppressFldrSelect);
      }
    }

    for (let i = 0; i < this.copiedItems.length; i++) {
      let item = this.copiedItems[i];
      if (item.itemType == gCmd.ITEMTYPE_CLIPPING) {
        this.newClippingCreated(item.id, item, aeConst.ORIGIN_CLIPPINGS_MGR, true);
      }
    }

    this.copiedItems = [];
  },

  // Helper methods
  _buildChildNodes: function (aFolderNode)
  {
    let id = parseInt(aFolderNode.key);
    
    gClippingsDB.transaction("rw", gClippingsDB.clippings, gClippingsDB.folders, () => {
      gClippingsDB.folders.where("parentFolderID").equals(id).each((aItem, aCursor) => {
        let newFldrNode = aFolderNode.addChildren({
          key: aItem.id + "F",
          title: sanitizeTreeNodeTitle(DEBUG_TREE ? `${aItem.name} [key=${aItem.id}F]` : aItem.name),
          folder: true,
          children: []
        });
        this._buildChildNodes(newFldrNode);

      }).then(() => {
        return gClippingsDB.clippings.where("parentFolderID").equals(id).each((aItem, aCursor) => {
          aFolderNode.addChildren({
            key: aItem.id + "C",
            title: sanitizeTreeNodeTitle(DEBUG_TREE ? `${aItem.name} [key=${aItem.id}C]` : aItem.name)
          });
        });

      }).then(() => {
        log(`Clippings: clippingsMgr/pg.js::gClippingsListener._buildChildNodes(): Updating display order for child folder '${aFolderNode.title}' (key = ${aFolderNode.key})`);
        gCmd.updateDisplayOrder(id, null, null, true);
      });
    }).catch(aErr => {
      console.error("Clippings: clippingsMgr/pg.js::gClippingsListener._buildChildNodes(): " + aErr);
    });
  },
  
  _removeClippingsTreeNode: function (aIDWithSuffix)
  {
    let tree = getClippingsTree();
    let targetNode = tree.getNodeByKey(aIDWithSuffix);
    let deletedNodeIdx = targetNode.getIndex();
    let prevSibNode = targetNode.getPrevSibling();
    let nextSibNode = targetNode.getNextSibling();
    let parentNode = targetNode.getParent();
    
    targetNode.remove();

    if (tree.count() == 0) {
      tree.options.icon = false;
      let emptyMsgNode = setEmptyClippingsState();
      tree.rootNode.addNode(emptyMsgNode);
      setStatusBarMsg(messenger.i18n.getMessage("clipMgrStatusBar", "0"));
    }
    else {
      // Select the node that used to be occupied by the delete node. If the
      // deleted node was the last node of its parent folder, then select the
      // last child of the parent.
      if (nextSibNode) {
        nextSibNode.setActive();
      }
      else if (prevSibNode) {
        prevSibNode.setActive();
      }
      else {
        if (parentNode.isRootNode()) {
          let parentNodes = parentNode.getChildren();
          if (deletedNodeIdx < parentNodes.length) {
            parentNodes[deletedNodeIdx].setActive();
          }
          else {
            parentNodes[parentNodes.length].setActive();
          }
        }
        else {
          parentNode.setActive();
        }
      }
    }
  },

  _isFlaggedForDelete: function (aItem)
  {
    return (aItem.parentFolderID == aeConst.DELETED_ITEMS_FLDR_ID);
  }
};

let gSyncClippingsListener = {
  onActivate(aSyncFolderID)
  {
    log("Clippings: clippingsMgr/pg.js::gSyncClippingsListener.onActivate()");
    aeDialog.cancelDlgs();
    gCmd.reloadSyncFolderIntrl();
  },
  
  onDeactivate(aOldSyncFolderID)
  {
    log(`Clippings: clippingsMgr/pg.js::gSyncClippingsListener.onDeactivate(): ID of old sync folder: ${aOldSyncFolderID}`);
    gSyncedItemsIDs.clear();
    gSyncedItemsIDMap.clear();

    gReloadSyncFldrBtn.hide();
    
    let clippingsTree = getClippingsTree();
    let syncFldrTreeNode = clippingsTree.getNodeByKey(aOldSyncFolderID + "F");
    syncFldrTreeNode.removeClass("ae-synced-clippings-fldr");
    syncFldrTreeNode.removeClass("ae-synced-clippings-readonly");

    let clippingsTreeElt = $("#clippings-tree");
    if (clippingsTreeElt.hasClass("cxt-menu-show-sync-items-only")) {
      clippingsTreeElt.removeClass("cxt-menu-show-sync-items-only");
    }
  },

  onAfterDeactivate(aRemoveSyncFolder, aOldSyncFolderID)
  {
    log(`Clippings: clippingsMgr/pg.js: gSyncClippingsListener.onAfterDeactivate(): Remove Synced Clippings folder = ${aRemoveSyncFolder}; old sync folder ID = ${aOldSyncFolderID}`)

    if (aRemoveSyncFolder) {
      let clippingsTree = getClippingsTree();

      let syncFldrTreeNode = clippingsTree.getNodeByKey(aOldSyncFolderID + "F");
      syncFldrTreeNode.remove();
      setStatusBarMsg();
      
      // TO DO: If there are no longer any clippings and folders, then show the
      // empty clippings UI.
    }
  },
};


// Search box
let gSearchBox = {
  _isInitialized: false,
  _isActive: false,
  _numMatches: null,
  _clippingsTree: null,

  init: function ()
  {
    if (this._isInitialized) {
      return;
    }
    
    $("#search-box").prop("placeholder", messenger.i18n.getMessage("clipMgrSrchBarHint"));
    $("#search-box").focus(aEvent => {
      gSearchBox.activate();
    });
    $("#search-box").blur(aEvent => { gSearchBox.deactivate() });

    $("#search-box").keyup(aEvent => {
      this.updateSearch();
      $("#clear-search").css({
        visibility: (aEvent.target.value ? "visible" : "hidden")
      });
    });

    $("#clear-search").on("click", aEvent => { this.reset() });

    this._isInitialized = true;
  },

  show: function ()
  {
    $("#search-clippings-and-folders").show();
  },

  hide: function ()
  {
    $("#search-clippings-and-folders").hide();
  },
  
  isVisible: function ()
  {
    return ($("#search-clippings-and-folders").css("display") != "none");
  },
  
  isActivated: function ()
  {
    return this._isActive;
  },

  updateSearch: function ()
  {
    let tree = getClippingsTree();
    let numMatches = tree.filterNodes($("#search-box").val());
    if (numMatches === undefined) {
      // User cleared search box by deleting all search text
      setStatusBarMsg();
    }
    else {
      setStatusBarMsg(messenger.i18n.getMessage("numMatches", numMatches));
    }

    this._numMatches = numMatches;
  },

  getCountMatches: function ()
  {
    return this._numMatches;
  },

  activate: function ()
  {
    this._isActive = true;
  },

  deactivate()
  {
    this._isActive = false;
  },
  
  reset: function ()
  {
    getClippingsTree().clearFilter();
    $("#search-box").val("").trigger("focus");
    $("#clear-search").css({ visibility: "hidden" });
    setStatusBarMsg();
  }
};

// Shortcut key editing
let gShortcutKey = {
  _oldKey:   "",
  _oldIndex: -1,

  init: function ()
  {
    $("#clipping-key").change(aEvent => {
      this.update();
    }).mousedown(aEvent => {
      this.setPrevShortcutKey();
    });

    $("#show-shortcut-list").attr("title", messenger.i18n.getMessage("clipMgrShortcutHelpHint"));
  },

  getPrevSelectedIndex: function ()
  {
    return this._oldIndex;
  },
  
  setPrevShortcutKey: function ()
  {
    let selectedNode = getClippingsTree().getActiveNode();
    if (! selectedNode) {
      return;
    }

    let clippingID = parseInt(selectedNode.key);
    this._oldIndex = $("#clipping-key")[0].selectedIndex;

    gClippingsDB.clippings.get(clippingID).then(aClipping => {
      this._oldKey = aClipping.shortcutKey;
    });
  },

  update: function ()
  {
    let shortcutKey = "";
    let shortcutKeyMenu = $("#clipping-key")[0];

    if (shortcutKeyMenu.selectedIndex == 0) {
      if (! this._oldKey) {
	// Skip shortcut key update if none was ever defined.
	return;
      }
    }
    else {
      shortcutKey = shortcutKeyMenu.options[shortcutKeyMenu.selectedIndex].text;
    }

    if (shortcutKey == this._oldKey) {
      return;
    }

    // Check if the shortcut key is already assigned.
    let assignedKeysLookup = {};
    gClippingsDB.clippings.where("shortcutKey").notEqual("").each((aItem, aCursor) => {
      assignedKeysLookup[aItem.shortcutKey] = 1;
    }).then(() => {
      if (assignedKeysLookup[shortcutKey]) {
        gDialogs.shctKeyConflict.showModal();
        return;
      }

      let selectedNode = getClippingsTree().getActiveNode();
      if (! selectedNode) {
        throw new Error("Can't set shortcut key if there is no clipping selected.");
      }

      let clippingID = parseInt(selectedNode.key);
      gClippingsSvc.updateClipping(clippingID, { shortcutKey }).then(aNumUpd => {
        if (gPrefs.clippingsUnchanged) {
          aePrefs.setPrefs({ clippingsUnchanged: false });
        }
        
        if (gSyncedItemsIDs.has(clippingID + "C")) {
          messenger.runtime.sendMessage({msgID: "push-sync-fldr-updates"})
            .catch(handlePushSyncItemsError);
        }
      });
    }).catch (aErr => {
      console.error(aErr);
    });
  }
};

// Clipping label picker in the options bar
let gClippingLabelPicker = {
  _labelPicker: null,
  
  init(aLabelPickerStor)
  {
    this._labelPicker = $(aLabelPickerStor);

    this._labelPicker.on("change", aEvent => {
      if (isFolderSelected()) {
        return;
      }

      let selectedNode = getClippingsTree().activeNode;
      let id = parseInt(selectedNode.key);
      let label = this.selectedLabel;

      gCmd.setLabelIntrl(id, label, gCmd.UNDO_STACK);
    });
  },

  get selectedLabel()
  {
    return this._labelPicker.val();
  },

  set selectedLabel(aLabel)
  {
    let color = aLabel;

    if (! aLabel) {
      color = "black";
    }
    else if (aLabel == "yellow") {
      color = "rgb(200, 200, 0)";
    }

    this._labelPicker.css({ color });
    this._labelPicker.val(aLabel);
  }
};

// Reload button for the Synced Clippings folder.
let gReloadSyncFldrBtn = {
  show()
  {
    let syncFldrID = gPrefs.syncFolderID;
    if (syncFldrID === null) {
      return;
    }

    let syncFldrSpanElt = this._getSyncFldrSpan()[0];
    let reloadBtn = document.createElement("span");
    reloadBtn.id = "reload-sync-fldr-btn";
    reloadBtn.title = messenger.i18n.getMessage("btnReload");
    reloadBtn.setAttribute("tabindex", "0");
    reloadBtn.setAttribute("role", "button");
    reloadBtn.addEventListener("click", aEvent => { gCmd.reloadSyncFolder() });
    reloadBtn.addEventListener("keydown", aEvent => {
      if (aEvent.key == "Enter" || aEvent.key == " ") {
        aEvent.target.click();
      }
    });
    
    syncFldrSpanElt.appendChild(reloadBtn);
  },

  hide()
  {
    let syncFldrSpan = this._getSyncFldrSpan();
    if (! syncFldrSpan) {
      console.error("Clippings: clippingsMgr/pg.js: gReloadSyncFldrBtn.hide(): Failed to retrieve the Fancytree <span> element for the Synced Clippings folder!");
      return;
    }

    let syncFldrSpanElt = syncFldrSpan[0];
    let reloadBtnElt = document.getElementById("reload-sync-fldr-btn");
    syncFldrSpanElt.removeChild(reloadBtnElt);
  },

  _getSyncFldrSpan() {
    return $("#clippings-tree > ul.ui-fancytree > li > span.ae-synced-clippings-fldr");
  },
};


// Instant editing for clipping/folder name and clipping text. Ensures that
// undo and redo works correctly when invoked via keyboard shortcut.
let gItemNameEditor, gClippingContentEditor;

class InstantEditor
{
  EDIT_INTERVAL = 3000;
  
  _stor = null;
  _intvID = null;
  _prevVal = '';

  constructor(aStor)
  {
    this._stor = aStor;
    
    $(this._stor).on("focus", aEvent => {
      this._intvID = setInterval(() => {
        if ($(this._stor).val() == this._prevVal) {
          return;
        }

        let tree = getClippingsTree();
        let selectedNode = tree.activeNode;

        if (selectedNode.isFolder()) {
          let fldrID = parseInt(selectedNode.key);
          if (this._stor == "#clipping-name") {
            gCmd.editFolderNameIntrl(fldrID, $(this._stor).val(), gCmd.UNDO_STACK);
          }
        }
        else {
          let clpgID = parseInt(selectedNode.key);
          if (this._stor == "#clipping-text") {
            gCmd.editClippingContentIntrl(clpgID, $(this._stor).val(), gCmd.UNDO_STACK);
          }
          else if (this._stor == "#clipping-name") {
            gCmd.editClippingNameIntrl(clpgID, $(this._stor).val(), gCmd.UNDO_STACK);
          }
        }
        this._prevVal = $(this._stor).val();

      }, this.EDIT_INTERVAL);

    }).on("blur", aEvent => {
      clearInterval(this._intvID);
      this._intvID = null;
      this._prevVal = '';
    });
  }
}


// Clippings Manager commands
let gCmd = clippingsMgrCmds();

function handlePushSyncUpdatesResponse(aResponse)
{
  if ("error" in aResponse && aResponse.error.name == "RangeError") {
    // Max sync file size exceeded.
    gDialogs.syncFldrFull.showModal();
  }
}


// Initializing Clippings Manager window
$(async () => {
  aeClippings.init();
  gClippingsDB = aeClippings.getDB();
  aeImportExport.setDatabase(gClippingsDB);

  gPrefs = await aePrefs.getAllPrefs();

  gEnvInfo = await messenger.runtime.sendMessage({msgID: "get-env-info"});

  // Platform-specific initialization.
  document.body.dataset.os = gEnvInfo.os;
  if (gEnvInfo.os == "mac") {
    $("#status-bar").css({backgroundImage: "none"});
  }
  else if (gEnvInfo.os == "linux") {
    if (gPrefs.clippingsMgrAutoShowStatusBar) {
      $("#status-bar").show();
      aePrefs.setPrefs({
        clippingsMgrAutoShowStatusBar: false,
        clippingsMgrStatusBar: true,
      });
    }
  }

  let lang = messenger.i18n.getUILanguage();
  document.body.dataset.locale = lang;
  moment.locale(lang);
  
  let wndURL = new URL(window.location.href);
  gOpenerWndID = Number(wndURL.searchParams.get("openerWndID"));
  gIsBackupMode = wndURL.searchParams.get("backupMode") || false;
  
  gIsMaximized = false;

  initToolbar();
  initInstantEditing();
  gShortcutKey.init();
  gClippingLabelPicker.init("#clipping-label-picker");
  initDialogs();
  buildClippingsTree();
  initTreeSplitter();
  initSyncItemsIDLookupList();
  
  if (gPrefs.clippingsMgrSaveWndGeom) {
    setSaveWndGeometryInterval(true);
  }

  if (gPrefs.clippingsMgrTreeWidth) {
    let width = `${parseInt(gPrefs.clippingsMgrTreeWidth)}px`;
    $("#clippings-tree").css({width});
  }
  
  if (gIsBackupMode) {
    gCmd.backup();
  }
  else {
    if (gPrefs.syncClippings && gPrefs.cxtMenuSyncItemsOnly
        && gPrefs.clippingsMgrShowSyncItemsOnlyRem) {
      gDialogs.showOnlySyncedItemsReminder.showModal();
    }
  }

  aeInterxn.init(gEnvInfo.os);
  if (gPrefs.defDlgBtnFollowsFocus) {
    aeInterxn.initDialogButtonFocusHandlers();
  }

  focusWnd();
  
  // Fix for Fx57 bug where bundled page loaded using
  // messenger.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });

  gWndID = wnd.id;
});


//
// Event handlers
//

// Reloading or closing Clippings Manager window
$(window).on("unload", aEvent => {
  log("Clippings: clippingsMgr/pg.js: onunload event");
  
  // Make sure that the selected clipping is saved before closing.
  if (! gIsClippingsTreeEmpty) {
    let tree = getClippingsTree();
    let selectedNode = tree.activeNode;
    if (selectedNode) {
      let id = parseInt(selectedNode.key);
      if (! selectedNode.folder) {
        let content = $("#clipping-text").val();
        gCmd.editClippingContentIntrl(id, content);
      }
    }
  }  
});


// Keyboard event handler
$(document).on("keydown", async (aEvent) => {
  const isMacOS = gEnvInfo.os == "mac";

  function isAccelKeyPressed()
  {
    if (isMacOS) {
      return aEvent.metaKey;
    }
    return aEvent.ctrlKey;
  }

  function isTextboxFocused(aEvent)
  {
    return (aEvent.target.tagName == "INPUT" || aEvent.target.tagName == "TEXTAREA");
  }

  aeDialog.hidePopups();

  // Prevent invoking keyboard shortcut actions while a dialog is open,
  // but allow dialog action keys ENTER and ESC.
  if (aeDialog.isOpen() && !(["Enter", "Escape"].includes(aEvent.key))) {
    return;
  }
  
  if (aEvent.key == "F1") {
    gCmd.showMiniHelp();
  }
  else if (aEvent.key == "F2") {
    aEvent.preventDefault();
    gCmd.redo();
  }
  else if (aEvent.key == "Enter") {
    log("Clippings: clippingsMgr/pg.js: ENTER key pressed!  Target element:");
    log(aEvent.target);

    // Thunderbird-specific. Ignore ENTER key press if the button for reloading
    // the Synced Clippings folder is focused.
    if (aEvent.target.tagName == "SPAN" && aEvent.target.id == "reload-sync-fldr-btn") {
      // Event handler attached to element already handles the ENTER key.
      return;
    }
    
    if (aEvent.target.tagName == "BUTTON" && !aEvent.target.classList.contains("dlg-accept")) {
      aEvent.target.click();
      aEvent.preventDefault();
      return;
    }

    // File picker in the Import modal dialog.
    if (aEvent.target.tagName == "INPUT" && aEvent.target.type == "file") {
      aEvent.target.click();
      return;
    }

    // Prevent duplicate invocation of default action button in modal dialogs.
    if (aeDialog.isOpen()) {
      if (! aEvent.target.classList.contains("default")) {
        aeDialog.acceptDlgs();
        aEvent.preventDefault();
      }
    }
  }
  else if (aEvent.key == "Escape") {
    if (gSearchBox.isActivated()) {
      gSearchBox.reset();
    }
    aeDialog.cancelDlgs();
  }
  else if (aEvent.key == "Clear" && gSearchBox.isActivated()) {
    gSearchBox.reset();
  }
  else if (aEvent.key == "Delete") {
    if (aEvent.target.tagName == "UL" && aEvent.target.classList.contains("ui-fancytree")) {
      gCmd.deleteClippingOrFolder(gCmd.UNDO_STACK);
    }
  }
  else if (aEvent.key == "/" || aEvent.key == "'") {
    if (! isTextboxFocused(aEvent)) {
      aEvent.preventDefault();
    }
  }
  else if (aEvent.key == "F5") {
    // Suppress browser reload.
    aEvent.preventDefault();
  }
  else if (aEvent.key == "F10" && isAccelKeyPressed()) {
    gCmd.toggleMaximize();
  }
  else if (aEvent.key == "F10" && aEvent.shiftKey) {
    let focusedTreeNodeElt = $(".fancytree-focused");
    if (focusedTreeNodeElt.length == 1) {
      focusedTreeNodeElt.parent().trigger("contextmenu");
    }
  }
  else if (aEvent.key.toUpperCase() == "A" && isAccelKeyPressed()) {
    if (! isTextboxFocused(aEvent)) {
      aEvent.preventDefault();
    }
  }
  else if (aEvent.key.toUpperCase() == "D" && isAccelKeyPressed()) {
    aEvent.preventDefault();
    gCmd.showHideDetailsPane();
  }
  else if (aEvent.key.toUpperCase() == "F" && isAccelKeyPressed()) {
    aEvent.preventDefault();
    $("#search-box").trigger("focus");
  }
  else if (aEvent.key.toUpperCase() == "W" && isAccelKeyPressed()) {
    closeWnd();
  }
  else if (aEvent.key.toUpperCase() == "Z" && isAccelKeyPressed() && !aEvent.shiftKey) {
    aEvent.preventDefault();
    gCmd.undo();
  }
  else if ((aEvent.key.toUpperCase() == "Z" && isAccelKeyPressed() && aEvent.shiftKey)
           || (aEvent.key.toUpperCase() == "Y" && isAccelKeyPressed())) {
    aEvent.preventDefault();
    gCmd.redo();
  }
  else {
    // Ignore standard browser shortcut keys.
    let key = aEvent.key.toUpperCase();
    if (isAccelKeyPressed() && (key == "D" || key == "F" || key == "N" || key == "P"
                                || key == "R" || key == "S" || key == "U")) {
      aEvent.preventDefault();
    }
  }
});


$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.tagName != "TEXTAREA") {
    aEvent.preventDefault();
  }
});


$(window).on("click", aEvent => {
  // HACK!!
  if ($("#shortcut-list-popup").hasClass("panel-show")) {
    return;
  }
  
  aeDialog.hidePopups();
});


$(window).on("focus", aEvent => {
  // Ensure prefs cache is initialized when the window focus event is fired;
  // it won't be at the time window is opened.
  if (gPrefs && gPrefs.clippingsMgrSaveWndGeom) {
    setSaveWndGeometryInterval(true);
  }
});


$(window).on("blur", aEvent => {
  if (gPrefs.clippingsMgrSaveWndGeom) {
    setSaveWndGeometryInterval(false);
  }
});


messenger.storage.onChanged.addListener((aChanges, aAreaName) => {
  let changedPrefs = Object.keys(aChanges);

  for (let pref of changedPrefs) {
    gPrefs[pref] = aChanges[pref].newValue;
  }
});


messenger.runtime.onMessage.addListener(aRequest => {
  let resp = null;
  
  switch (aRequest.msgID) {
  case "ping-clippings-mgr":
    resp = {isOpen: true};
    break;

  case "toggle-save-clipman-wnd-geom":
    setSaveWndGeometryInterval(aRequest.saveWndGeom);
    break;

  case "focus-clippings-mgr-wnd":
    focusWnd();
    break;

  case "focus-ext-window":
    if (aRequest.wndID == gWndID) {
      focusWnd();
    }
    if (aRequest.execActionMsgID == "new-from-clipbd") {
      gCmd.newClippingFromClipboard();
    }
    break;

  case "sync-activated":
    gSyncClippingsListener.onActivate(aRequest.syncFolderID);
    break;

  case "sync-deactivated":
    gSyncClippingsListener.onDeactivate(aRequest.oldSyncFolderID);
    break;

  case "sync-deactivated-after":
    gSyncClippingsListener.onAfterDeactivate(aRequest.removeSyncFolder, aRequest.oldSyncFolderID);
    break;

  case "new-clipping-created":
    gClippingsListener.newClippingCreated(aRequest.newClippingID, aRequest.newClipping, aRequest.origin);
    break;

  case "new-folder-created":
    gClippingsListener.newFolderCreated(aRequest.newFolderID, aRequest.newFolder, aRequest.origin);
    break;

  case "clippings-mgr-save-backup":
    gCmd.backupExtern();
    break;

  case "get-perm-req-key":
    if (aRequest.opener == gWndID) {
      resp = gPermissionReq.get();
      gPermissionReq.clear();
    }      
    break;

  default:
    break;
  }

  if (resp) {
    return Promise.resolve(resp);
  }
});




//
// Clippings Manager functions
//

function initToolbar()
{
  // Show or hide the details pane and status bar.
  if (! gPrefs.clippingsMgrDetailsPane) {
    $("#options-bar").hide();
  }

  if (! gPrefs.clippingsMgrStatusBar) {
    $("#status-bar").hide();
    recalcContentAreaHeight($("#status-bar").css("display") != "none");
  }

  $("#new-clipping").on("click", aEvent => { gCmd.newClipping(gCmd.UNDO_STACK) });
  $("#new-folder").on("click", aEvent => { gCmd.newFolder(gCmd.UNDO_STACK) });
  $("#move").attr("title", messenger.i18n.getMessage("tbMoveOrCopy")).on("click", aEvent => {
    gCmd.moveClippingOrFolder();
  });
  $("#delete").attr("title", messenger.i18n.getMessage("tbDelete")).on("click", aEvent => {
    gCmd.deleteClippingOrFolder(gCmd.UNDO_STACK);
  });
  $("#undo").attr("title", messenger.i18n.getMessage("tbUndo")).on("click", aEvent => {
    gCmd.undo();
  });
  $("#help").attr("title", messenger.i18n.getMessage("tbHelp")).on("click", aEvent => {
    gCmd.showMiniHelp();
  });

  // Placeholder toolbar -> Presets menu
  $.contextMenu({
    selector: "#plchldr-presets",
    trigger: "left",
    className: "placeholder-menu",

    events: {
      activated: function (aOptions) {
        $("#plchldr-presets").addClass("toolbar-button-menu-open");
      },

      hide: function (aOptions) {
        $("#plchldr-presets").removeClass("toolbar-button-menu-open");
      },
    },

    position: function (aOpt, aX, aY) {
      aX = undefined;
      aY = undefined;

      aOpt.$menu.position({
        my: "left top",
        at: "left bottom",
        of: $("#plchldr-presets"),
      });
    },

    callback: function (aItemKey, aOpt, aRootMenu, aOriginalEvent) {
      let contentTextArea = $("#clipping-text");
      contentTextArea.trigger("focus");

      function insertPlaceholder(aPlaceholder) {
        insertTextIntoTextbox(contentTextArea, aPlaceholder);
      }
      
      switch (aItemKey) {
      case "insDate":
        insertPlaceholder("$[DATE]");
        break;
        
      case "insTime":
        insertPlaceholder("$[TIME]");
        break;
        
      case "insAppName":
        insertPlaceholder("$[HOSTAPP]");
        break;
        
      case "insUserAgent":
        insertPlaceholder("$[UA]");
        break;
        
      case "insClippingName":
        insertPlaceholder("$[NAME]");
        break;
        
      case "insParentFolderName":
        insertPlaceholder("$[FOLDER]");
        break;

      case "insFormattedDateTime":
        gCmd.insertFormattedDateTimePlaceholder();
        break;
        
      case "insClippingInClipping":
        gCmd.insertClippingInClippingPlaceholder();
        break;

      case "insSubject":
        insertPlaceholder("$[SUBJECT]");
        break;

      case "insToNameEmail":
        insertPlaceholder("$[TO]");
        break;
        
      case "insToName":
        insertPlaceholder("$[TO_NAME]");
        break;

      case "insToEmail":
        insertPlaceholder("$[TO_EMAIL]");
        break;

      case "insCcNameEmail":
        insertPlaceholder("$[CC]");
        break;

      case "insCcName":
        insertPlaceholder("$[CC_NAME]");
        break;

      case "insCcEmail":
        insertPlaceholder("$[CC_EMAIL]");
        break;

      case "insFromNameEmail":
        insertPlaceholder("$[FROM]");
        break;

      case "insFromName":
        insertPlaceholder("$[FROM_NAME]");
        break;

      case "insFromEmail":
        insertPlaceholder("$[FROM_EMAIL]");
        break;

      default:
        window.alert("The selected action is not available right now.");
        break;
      }
    },

    items: {
      insDate: {
        name: messenger.i18n.getMessage("mnuPlchldrDate"),
        className: "ae-menuitem"
      },
      insTime: {
        name: messenger.i18n.getMessage("mnuPlchldrTime"),
        className: "ae-menuitem"
      },
      insAppName: {
        name: messenger.i18n.getMessage("mnuPlchldrAppName"),
        className: "ae-menuitem"
      },
      insUserAgent: {
        name: messenger.i18n.getMessage("mnuPlchldrUsrAgent"),
        className: "ae-menuitem"
      },
      insClippingName: {
        name: messenger.i18n.getMessage("mnuPlchldrClipName"),
        className: "ae-menuitem"
      },
      insParentFolderName: {
        name: messenger.i18n.getMessage("mnuPlchldrFldrName"),
        className: "ae-menuitem"
      },
      separator1: "--------",
      insFormattedDateTime: {
        name: messenger.i18n.getMessage("mnuPlchldrFmtDateTime"),
        className: "ae-menuitem"
      },
      insClippingInClipping: {
        name: messenger.i18n.getMessage("mnuPlchldrClipClip"),
        className: "ae-menuitem"
      },
      separator2: "--------",
      toSubmenu: {
        name: messenger.i18n.getMessage("mnuPlchldrTo"),
        items: {
          insToNameEmail: {
            name: messenger.i18n.getMessage("mnuPlchldrNameEmail"),
            className: "ae-menuitem"
          },
          insToName: {
            name: messenger.i18n.getMessage("mnuPlchldrName"),
            className: "ae-menuitem"
          },
          insToEmail: {
            name: messenger.i18n.getMessage("mnuPlchldrEmail"),
            className: "ae-menuitem"
          },
        },
      },
      ccSubmenu: {
        name: messenger.i18n.getMessage("mnuPlchldrCc"),
        items: {
          insCcNameEmail: {
            name: messenger.i18n.getMessage("mnuPlchldrNameEmail"),
            className: "ae-menuitem"
          },
          insCcName: {
            name: messenger.i18n.getMessage("mnuPlchldrName"),
            className: "ae-menuitem"
          },
          insCcEmail: {
            name: messenger.i18n.getMessage("mnuPlchldrEmail"),
            className: "ae-menuitem"
          },
        },
      },
      fromSubmenu: {
        name: messenger.i18n.getMessage("mnuPlchldrFrom"),
        items: {
          insFromNameEmail: {
            name: messenger.i18n.getMessage("mnuPlchldrNameEmail"),
            className: "ae-menuitem"
          },
          insFromName: {
            name: messenger.i18n.getMessage("mnuPlchldrName"),
            className: "ae-menuitem"
          },
          insFromEmail: {
            name: messenger.i18n.getMessage("mnuPlchldrEmail"),
            className: "ae-menuitem"
          },
        },
      },
      insSubject: {
        name: messenger.i18n.getMessage("mnuPlchldrSubj"),
        className: "ae-menuitem"
      },
    }
  });
  
  // Tools menu
  $.contextMenu({
    selector: "#clippings-mgr-options",
    trigger: "left",
    className: "tools-menu",

    events: {
      activated: function (aOptions) {
        let mnu = aOptions.$menu;
        mnu[0].focus();
        $("#clippings-mgr-options").addClass("toolbar-button-menu-open");
      },

      hide: function (aOptions) {
        $("#clippings-mgr-options").removeClass("toolbar-button-menu-open");
      }
    },
    
    position: function (aOpt, aX, aY) {
      aX = undefined;
      aY = undefined;

      aOpt.$menu.position({
        my: "left top",
        at: "left bottom",
        of: $("#clippings-mgr-options")
      });
    },
    
    callback: function (aItemKey, aOpt, aRootMenu, aOriginalEvent) {
      switch (aItemKey) {
      case "newFromClipboard":
        gCmd.newClippingFromClipboard();
        break;

      case "backup":
        gCmd.backup();
        break;
        
      case "restoreFromBackup":
        gCmd.restoreFromBackup();
        break;
        
      case "importFromFile":
        gCmd.importFromFile();
        break;

      case "exportToFile":
        gCmd.exportToFile();
        break;

      case "togglePlchldrToolbar":
        gCmd.showHidePlaceholderToolbar();
        break;
        
      case "toggleDetailsPane":
        gCmd.showHideDetailsPane();
        break;

      case "toggleStatusBar":
        gCmd.showHideStatusBar();
        break;

      case "maximizeWnd":
        setTimeout(async () => { gCmd.toggleMaximize() }, 100);
        break;

      case "openExtensionPrefs":
        gCmd.openExtensionPrefs();
        break;
        
      default:
        window.alert("The selected action is not available right now.");
        break;
      }
    },
    items: {
      newFromClipboard: {
        name: messenger.i18n.getMessage("mnuNewFromClipbd"),
        className: "ae-menuitem",
      },
      separator0: "--------",
      backup: {
        name: messenger.i18n.getMessage("mnuBackup"),
        className: "ae-menuitem",
        disabled: function (aKey, aOpt) {
          return (gIsClippingsTreeEmpty);
        }
      },
      restoreFromBackup: {
        name: messenger.i18n.getMessage("mnuRestoreFromBackup"),
        className: "ae-menuitem"
      },
      separator1: "--------",
      importFromFile: {
        name: messenger.i18n.getMessage("mnuImport"),
        className: "ae-menuitem"
      },
      exportToFile: {
        name: messenger.i18n.getMessage("mnuExport"),
        className: "ae-menuitem",
        disabled: function (aKey, aOpt) {
          return (gIsClippingsTreeEmpty);
        }
      },
      separator2: "--------",
      showHideSubmenu: {
        name: messenger.i18n.getMessage("mnuShowHide"),
        items: {
          toggleDetailsPane: {
            name: messenger.i18n.getMessage("mnuShowHideDetails"),
            className: "ae-menuitem",
            disabled: function (aKey, aOpt) {
              return (gIsClippingsTreeEmpty || isFolderSelected() || isSeparatorSelected());
            },
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if ($("#options-bar").css("display") != "none") {
                return "context-menu-icon-checked";
              }
            }
          },
          togglePlchldrToolbar: {
            name: messenger.i18n.getMessage("mnuShowHidePlchldrBar"),
            className: "ae-menuitem",
            disabled: function (aKey, aOpt) {
              return (gIsClippingsTreeEmpty || isFolderSelected() || isSeparatorSelected());
            },
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if ($("#placeholder-toolbar").css("display") != "none") {
                return "context-menu-icon-checked";
              }
            }
          },         
          toggleStatusBar: {
            name: messenger.i18n.getMessage("mnuShowHideStatusBar"),
            className: "ae-menuitem",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if ($("#status-bar").css("display") != "none") {
                return "context-menu-icon-checked";
              }
            }
          }
        }
      },
      maximizeWnd: {
        name: messenger.i18n.getMessage("mnuMaximize"),
        className: "ae-menuitem",
        visible: function (aKey, aOpt) {
          return (gEnvInfo.os == "win" || DEBUG_WND_ACTIONS);
        },
        icon: function (aKey, aOpt) {
          if (gIsMaximized) {
            return "context-menu-icon-checked";
          }
        }
      },
      windowCmdsSeparator: {
        type: "cm_separator",
        visible: function (akey, aOpt) {
          return (gEnvInfo.os != "mac" || DEBUG_WND_ACTIONS);
        }
      },
      openExtensionPrefs: {
        name: messenger.i18n.getMessage("mnuShowExtPrefs"),
        className: "ae-menuitem"
      }
    }
  });

  aeInterxn.initContextMenuAriaRoles(".placeholder-menu");
  aeInterxn.initContextMenuAriaRoles(".tools-menu");
  
  $("#custom-plchldr").on("click", aEvent => { gCmd.insertCustomPlaceholder() });
  $("#auto-incr-plchldr").on("click", aEvent => { gCmd.insertNumericPlaceholder() });
  $("#show-shortcut-list").on("click", aEvent => { gCmd.showShortcutList() });

  gSearchBox.init();

  aeVisual.preloadLafImages();
  aeVisual.preloadMsgBoxIcons(true);
  aeVisual.cacheIcons(
    "newClipping_hover.svg",
    "newClipping-active-dk.svg",
    "newFolder_hover.svg",
    "newFolder-active-dk.svg",
    "moveTo_hover.svg",
    "moveTo-active-dk.svg",
    "delete_hover.svg",
    "delete-active-dk.svg",
    "undo_hover.svg",
    "options_hover.svg",
    "options_menuopen.svg",
    "shctkeys_hover.svg",
    "help_hover.svg",
    "customPlchldr.svg",
    "numericPlchldr.svg",
    "customPlchldr_hover.svg",
    "numericPlchldr_hover.svg",
    "options_dk_hover.svg",
    "options_dk_active.svg",
    "options_dk_menuopen.svg",
    "shctkeys_hover-dk.svg",
    "help-dk.svg",
    "folder-open.svg",
    "tree-fldr-open.svg",
    "tree-fldr-close.svg",
    "tree-fldr-open-dk.svg",
    "tree-fldr-close-dk.svg",
  );
}


function initInstantEditing()
{
  $("#clipping-name").attr("placeholder", messenger.i18n.getMessage("clipMgrNameHint"))
    .blur(aEvent => {
      let tree = getClippingsTree();
      let selectedNode = tree.activeNode;
      let name = aEvent.target.value;
      let id = parseInt(selectedNode.key);

      if (selectedNode.isFolder()) {
        if (name) {
          gCmd.editFolderNameIntrl(id, name, gCmd.UNDO_STACK);
        }
        else {
          aEvent.target.value = messenger.i18n.getMessage("untitledFolder");
          gCmd.editFolderNameIntrl(id, messenger.i18n.getMessage("untitledFolder"), gCmd.UNDO_STACK);
        }
      }
      else {
        if (name) {
          gCmd.editClippingNameIntrl(id, name, gCmd.UNDO_STACK);
        }
        else {
          aEvent.target.value = messenger.i18n.getMessage("untitledClipping");
          gCmd.editClippingNameIntrl(id, messenger.i18n.getMessage("untitledClipping"), gCmd.UNDO_STACK);
        }
      }
    });
  
  let contentAutoSave = new aeAutoSave($("#clipping-text")[0], gPrefs.clippingsMgrAutoSaveIntv);
  contentAutoSave.debug = aeConst.DEBUG;
  
  $("#clipping-text").attr("placeholder", messenger.i18n.getMessage("clipMgrContentHint"))
    .attr("spellcheck", gPrefs.checkSpelling)
    .focus(aEvent => {
      let tree = getClippingsTree();
      let selectedNode = tree.activeNode;
      let id = parseInt(selectedNode.key);

      contentAutoSave.onSave = aContent => {
        gCmd.editClippingContentIntrl(id, aContent, gCmd.UNDO_STACK);
      };
      contentAutoSave.start();
    }).blur(aEvent => {
      let tree = getClippingsTree();
      let selectedNode = tree.activeNode;
      let id = parseInt(selectedNode.key);

      if (! selectedNode.folder) {
        let content = aEvent.target.value;
        gCmd.editClippingContentIntrl(id, content, gCmd.UNDO_STACK);
      }

      contentAutoSave.stop();
    });

  gItemNameEditor = new InstantEditor("#clipping-name");
  gClippingContentEditor = new InstantEditor("#clipping-text");
}


function initIntroBannerAndHelpDlg()
{
  const isWin = gEnvInfo.os == "win";
  const isMacOS = gEnvInfo.os == "mac";
  const isLinux = gEnvInfo.os == "linux";

  function buildKeyMapTable(aTableDOMElt)
  {
    let shctKeys = [];
    if (isMacOS) {
      shctKeys = [
        "\u2326", "esc", "\u2318D", "\u2318F", "\u2318W", "\u2318Z", "F1",
        "F2 / \u21e7\u2318Z", "\u2318F10"
      ];
    }
    else {
      let altRedo;
      if (isWin) {
        altRedo = `${messenger.i18n.getMessage("keyCtrl")}+Y`;
      }
      else {
        altRedo = `${messenger.i18n.getMessage("keyCtrl")}+${messenger.i18n.getMessage("keyShift")}+Z`;
      }
      shctKeys = [
        messenger.i18n.getMessage("keyDel"),
        messenger.i18n.getMessage("keyEsc"),
        `${messenger.i18n.getMessage("keyCtrl")}+D`,
        `${messenger.i18n.getMessage("keyCtrl")}+F`,
        `${messenger.i18n.getMessage("keyCtrl")}+W`,
        `${messenger.i18n.getMessage("keyCtrl")}+Z`,
        "F1",
        `F2 / ${altRedo}`,
        `${messenger.i18n.getMessage("keyCtrl")}+F10`,
      ];
    }

    function buildKeyMapTableRow(aShctKey, aCmdL10nStrIdx, aIsCompactKey=false)
    {
      let tr = document.createElement("tr");
      let tdKey = document.createElement("td");
      let tdCmd = document.createElement("td");
      tdKey.appendChild(document.createTextNode(aShctKey));
      tdCmd.appendChild(document.createTextNode(messenger.i18n.getMessage(aCmdL10nStrIdx)));

      if (aIsCompactKey) {
        tdKey.className = "condensed";
      }

      tr.appendChild(tdKey);
      tr.appendChild(tdCmd);

      return tr;
    }

    aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[0], "clipMgrIntroCmdDel"));
    aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[1], "clipMgrIntroCmdClearSrchBar"));
    aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[2], "clipMgrIntroCmdDetailsPane"));
    aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[3], "clipMgrIntroCmdSrch"));
    aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[4], "clipMgrIntroCmdClose"));
    aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[5], "clipMgrIntroCmdUndo"));
    aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[6], "clipMgrIntroCmdShowIntro"));
    aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[7], "clipMgrIntroCmdRedo", isLinux));

    if (! isLinux) {
      aTableDOMElt.appendChild(buildKeyMapTableRow(shctKeys[8], "clipMgrIntroCmdMaximize"));
    }
  }
 
  let shctKeyTbls = $(".shortcut-key-tbl");

  for (let tbl of shctKeyTbls) {
    buildKeyMapTable(tbl);
  }
}


function initDialogs()
{
  let osName = gEnvInfo.os;
  $(".msgbox-icon").attr("os", osName);
  $("#import-dlg #restore-backup-warning > .warning-icon").attr("os", osName);

  initIntroBannerAndHelpDlg();

  gDialogs = clippingsMgrDlgs();

}


function getClippingsTree()
{
  let rv = $.ui.fancytree.getTree("#clippings-tree");
  return rv;
}


async function buildClippingsTree()
{
  let treeData = [];
  try {
    treeData = await buildClippingsTreeHelper(aeConst.ROOT_FOLDER_ID); 
  }
  catch (e) {
    console.error("clippingsMgr/pg.js::buildClippingsTree(): %s", e);
    showInitError();
    return;
  }

  if (treeData.length == 0) {
    treeData = setEmptyClippingsState();
  }

  $("#clippings-tree").fancytree({
    extensions: ["dnd5", "filter"],

    debugLevel: 0,
    autoScroll: true,
    source: treeData,
    selectMode: 1,
    strings: { noData: messenger.i18n.getMessage("clipMgrNoItems") },
    icon: (gIsClippingsTreeEmpty ? false : true),

    init: function (aEvent, aData) {
      let rootNode = aData.tree.getRootNode();
      if (rootNode.children.length > 0 && !gIsClippingsTreeEmpty) {
        rootNode.children[0].setActive();
      }
    },

    activate: function (aEvent, aData) {
      log("Clippings: clippingsMgr/pg.js: Activate event fired on clippings tree");
      updateDisplay(aEvent, aData);
    },

    async dblclick(aEvent, aData) {
      log("Clippings: clippingsMgr/pg.js: Double-click event fired on clippings tree");
      updateDisplay(aEvent, aData);

      if (aData.targetType == "title" || aData.targetType == "icon") {
        if (! aData.node.isFolder()) {
          let clippingID = parseInt(aData.node.key);
          gCmd.pasteClipping(clippingID);
        }
      }
    },

    dnd5: {
      autoExpandMS: 1000,
      preventRecursion: true,
      preventVoidMoves: true,
      scroll: true,

      dragStart: function (aNode, aData) {
        // Prevent drag 'n drop out of Synced Clippings folder if sync file
        // is read-only.
        let nodeID = parseInt(aNode.key);
        let isSyncedItem = gSyncedItemsIDs.has(nodeID + (aNode.folder ? "F" : "C"));
        if (gPrefs.syncClippings && gPrefs.isSyncReadOnly && isSyncedItem) {
          return false;
        }

        gReorderedTreeNodeNextSibling = aNode.getNextSibling();
        return true;
      },

      dragEnd: function (aNode, aData) {
        gReorderedTreeNodeNextSibling = null;
      },

      dragEnter: function (aNode, aData) {
        if (! aNode.isFolder()) {
          // Prevent attempt to drop a node into a non-folder node; in such a
          // case, only allow reordering of nodes.
          return ["before", "after"];
        }
        
        aData.dataTransfer.dropEffect = "move";
        return true;
      },

      async dragDrop(aNode, aData)
      {
        if (gIsClippingsTreeEmpty) {
          return;
        }

        // Prevent dropping into a non-folder node.
        if (!aNode.isFolder() && aData.hitMode == "over") {
          return;
        }

        function getStaticID(aSyncedItemID)
        {
          let rv;
          if (gPrefs.syncClippings) {
            for (let [key, value] of gSyncedItemsIDMap) {
              if (value == aSyncedItemID) {
                rv = key;
                break;
              }
            }
          }
          return rv;
        }
        // END nested function
        
        let parentNode = aNode.getParent();
        
        if (aData.otherNode) {           
          let newParentID = aeConst.ROOT_FOLDER_ID;

          if (aNode.isFolder() && aData.hitMode == "over") {
            newParentID = parseInt(aNode.key);
          }
          else {
            newParentID = (parentNode.isRootNode() ? aeConst.ROOT_FOLDER_ID : parseInt(parentNode.key));
          }

          let oldParentID;
          if (aData.otherNode.getParent().isRootNode()) {
            oldParentID = aeConst.ROOT_FOLDER_ID;
          }
          else {
            oldParentID = parseInt(aData.otherNode.getParent().key);
          }

          let id = parseInt(aData.otherNode.key);
          if (gPrefs.syncClippings && aData.otherNode.isFolder() && id == gPrefs.syncFolderID
              && newParentID != aeConst.ROOT_FOLDER_ID) {
            warn("The Synced Clippings folder cannot be moved.");
            return;
          }

          // Prevent drag 'n drop into Synced Clippings folder if sync file
          // is read-only.
          if (gPrefs.syncClippings && gPrefs.isSyncReadOnly
              && gSyncedItemsIDs.has(newParentID + "F")) {
            setTimeout(() => { gDialogs.syncFldrReadOnly.openPopup() }, 100);
            return;
          }

          await messenger.runtime.sendMessage({msgID: "dnd-move-started"});

          aData.otherNode.moveTo(aNode, aData.hitMode);
          
          log(`Clippings: clippingsMgr/pg.js::#clippings-tree.dnd5.dragDrop(): ID of moved clipping or folder: ${id}\nID of old parent folder: ${oldParentID}\nID of new parent folder: ${newParentID}`);

          let isReordering = false;

          if (newParentID == oldParentID) {
            log(`It appears that the node (key = ${aData.otherNode.key}) was just reordered, as it was moved within the same folder. Rebuilding Clippings context menu.`);
            isReordering = true;
          }
          else {
            // The following `gCmd` method calls will trigger rebuild of the
            // Clippings context menu, which will be suppressed by the
            // background script.
            if (aData.otherNode.isFolder()) {
              await gCmd.moveFolderIntrl(id, newParentID, gCmd.UNDO_STACK);
            }
            else {
              await gCmd.moveClippingIntrl(id, newParentID, gCmd.UNDO_STACK);
            }
          }

          log("Clippings: clippingsMgr/pg.js::#clippings-tree.dnd5.dragDrop(): Updating display order");
          let destUndoStack = null;
          let undoInfo = null;
          
          if (isReordering) {
            let nextSiblingNode = gReorderedTreeNodeNextSibling;
            destUndoStack = gCmd.UNDO_STACK;
            
            undoInfo = {
              action: gCmd.ACTION_CHANGEPOSITION,
              id: parseInt(aData.otherNode.key),
              nodeKey: aData.otherNode.key,
              parentFolderID: newParentID,
              itemType: (aNode.folder ? gCmd.ITEMTYPE_FOLDER : gCmd.ITEMTYPE_CLIPPING),
              nextSiblingNodeKey: (nextSiblingNode ? nextSiblingNode.key : null),
            };

            if (gPrefs.syncClippings) {
              let sfx = aData.otherNode.isFolder() ? "F" : "C";
              let syncedNodeKey = `${undoInfo.id}${sfx}`;

              if (gSyncedItemsIDs.has(syncedNodeKey)) {
                undoInfo.sid = getStaticID(syncedNodeKey);
                if (nextSiblingNode) {
                  undoInfo.nextSiblingSID = getStaticID(undoInfo.nextSiblingNodeKey);
                }
                if (newParentID != gPrefs.syncFolderID && gSyncedItemsIDs.has(`${newParentID}F`)) {
                  undoInfo.parentFldrSID = getStaticID(`${newParentID}F`);
                }
              }
            }

            log("Clippings: clippingsMgr/pg.js: Saving undo info for clipping/folder reordering:");
            log(undoInfo);
          }
          
          await messenger.runtime.sendMessage({msgID: "dnd-move-finished"});

          // Rebuild Clippings context menu only once.
          await gCmd.updateDisplayOrder(oldParentID, destUndoStack, undoInfo, !isReordering);
          if (!isReordering) {
            await gCmd.updateDisplayOrder(newParentID, null, null, false);
          }

          if (newParentID != oldParentID) {
            aNode.setExpanded();
          }
        }
        else {
          // Dropping a non-node.
          let dndData = aData.dataTransfer.getData("text");

          if (! dndData) {
            log("Clippings: clippingsMgr/pg.js: #clippings-tree.dnd5.dragDrop(): Non-node was dropped into tree.  Unable to process its data; ignoring.");
            return;
          }
          
          log("Clippings: clippingsMgr/pg.js: #clippings-tree.dnd5.dragDrop(): Non-node was dropped into tree.  Textual content detected.");
          
          aData.dataTransfer.effect = "copy";

          let parentID = aeConst.ROOT_FOLDER_ID;
          if (aNode.isFolder() && aData.hitMode == "over") {
            parentID = parseInt(aNode.key);
          }
          else {
            parentID = parentNode.isRootNode() ? aeConst.ROOT_FOLDER_ID : parseInt(parentNode.key);
          }

          let clipName = aeClippings.createClippingNameFromText(dndData);
          let clipContent = dndData;

          gCmd.newClippingWithContent(parentID, clipName, clipContent, gCmd.UNDO_STACK);
	  
          if (aNode.isFolder()) {
            aNode.setExpanded();
          }
        }
      }
    },

    filter: {
      autoExpand: true,
      counter: false,
      highlight: true,
      mode: "hide"
    }
  });

  setStatusBarMsg(gIsClippingsTreeEmpty ? messenger.i18n.getMessage("clipMgrStatusBar", "0") : null);

  // Context menu for the clippings tree.
  $.contextMenu({
    selector: "#clippings-tree > ul.ui-fancytree > li",
    className: "clippings-tree-cxt-menu",

    events: {
      activated(aOpts) {
        let mnu = aOpts.$menu;
        mnu[0].focus();  
      },

      show(aOpts) {
        let treeItemSpan = aOpts.$trigger[0].firstChild;
        if (treeItemSpan.classList.contains("fancytree-statusnode-nodata")) {
          // Hide the context menu if "No items found" in the search results
          // is selected.
          return false;
        }
        return (! gIsClippingsTreeEmpty);
      }
    },
    
    callback: function (aItemKey, aOpt, aRootMenu, aOriginalEvent) {
      function setLabel(aLabel) {
        let tree = getClippingsTree();
        let selectedNode = tree.activeNode;
        if (!selectedNode || selectedNode.isFolder()) {
          return;
        }

        let clippingID = parseInt(selectedNode.key);
        gCmd.setLabelIntrl(clippingID, aLabel, gCmd.UNDO_STACK);
      }
      
      switch (aItemKey) {
      case "reloadSyncFolder":
	gCmd.reloadSyncFolder();
	break;
	
      case "moveOrCopy":
        gCmd.moveClippingOrFolder();
        break;
        
      case "deleteItem":
        gCmd.deleteClippingOrFolder(gCmd.UNDO_STACK);
        break;
        
      case "labelNone":
        setLabel("");
        break;
        
      case "labelRed":
      case "labelOrange":
      case "labelYellow":
      case "labelGreen":
      case "labelBlue":
      case "labelPurple":
      case "labelGrey":
        setLabel(aItemKey.substr(5).toLowerCase());
        break;

      case "insertSeparator":
        gCmd.insertSeparator(gCmd.UNDO_STACK);
        break;

      default:
        window.alert("The selected action is not available right now.");
        break;
      }
    },
    
    items: {
      reloadSyncFolder: {
        name: messenger.i18n.getMessage("mnuReloadSyncFldr"),
        className: "ae-menuitem",
        visible: function (aItemKey, aOpt) {
          let tree = getClippingsTree();
          let selectedNode = tree.activeNode;
          
          if (!selectedNode || !selectedNode.isFolder()) {
            return false;
          }

          let folderID = parseInt(selectedNode.key);
          return (folderID == gPrefs.syncFolderID);
        }
      },

      moveOrCopy: {
        name: messenger.i18n.getMessage("mnuMoveOrCopy"),
        className: "ae-menuitem",
        disabled: function (aKey, aOpt) {
          let tree = getClippingsTree();
          let selectedNode = tree.activeNode;

          if (! selectedNode) {
            return false;
          }

          if (isSeparatorSelected()) {
            return true;
          }

          let folderID = parseInt(selectedNode.key);
          return (selectedNode.isFolder() && folderID == gPrefs.syncFolderID);
        }
      },
      labelSubmenu: {
        name: messenger.i18n.getMessage("mnuEditLabel"),
        visible: function (aItemKey, aOpt) {
          return (!isFolderSelected() && !isSeparatorSelected());
        },
        disabled(aKey, aOpt) {
          let selectedNode = getClippingsTree().activeNode;
          let nodeID = parseInt(selectedNode.key);

          // Prevent changing label on a synced clipping if the sync file
          // is read-only.
          let isSyncedItem = gSyncedItemsIDs.has(nodeID + "C");
          return (gPrefs.syncClippings && gPrefs.isSyncReadOnly && isSyncedItem);
        },
        items: {
          labelNone: {
            name: messenger.i18n.getMessage("none"),
            className: "ae-menuitem",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if (gClippingLabelPicker.selectedLabel == "") {
                return "context-menu-icon-checked";
              }
            }
          },
          labelRed: {
            name: messenger.i18n.getMessage("labelRed"),
            className: "ae-menuitem clipping-label-red",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if (gClippingLabelPicker.selectedLabel == aItemKey.substr(5).toLowerCase()) {
                return "context-menu-icon-checked";
              }
            }
          },
          labelOrange: {
            name: messenger.i18n.getMessage("labelOrange"),
            className: "ae-menuitem clipping-label-orange",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if (gClippingLabelPicker.selectedLabel == aItemKey.substr(5).toLowerCase()) {
                return "context-menu-icon-checked";
              }
            }
          },
          labelYellow: {
            name: messenger.i18n.getMessage("labelYellow"),
            className: "ae-menuitem clipping-label-yellow",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if (gClippingLabelPicker.selectedLabel == aItemKey.substr(5).toLowerCase()) {
                return "context-menu-icon-checked";
              }
            }
          },
          labelGreen: {
            name: messenger.i18n.getMessage("labelGreen"),
            className: "ae-menuitem clipping-label-green",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if (gClippingLabelPicker.selectedLabel == aItemKey.substr(5).toLowerCase()) {
                return "context-menu-icon-checked";
              }
            }
          },
          labelBlue: {
            name: messenger.i18n.getMessage("labelBlue"),
            className: "ae-menuitem clipping-label-blue",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if (gClippingLabelPicker.selectedLabel == aItemKey.substr(5).toLowerCase()) {
                return "context-menu-icon-checked";
              }
            }
          },
          labelPurple: {
            name: messenger.i18n.getMessage("labelPurple"),
            className: "ae-menuitem clipping-label-purple",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if (gClippingLabelPicker.selectedLabel == aItemKey.substr(5).toLowerCase()) {
                return "context-menu-icon-checked";
              }
            }
          },
          labelGrey: {
            name: messenger.i18n.getMessage("labelGrey"),
            className: "ae-menuitem clipping-label-grey",
            icon: function (aOpt, $itemElement, aItemKey, aItem) {
              if (gClippingLabelPicker.selectedLabel == aItemKey.substr(5).toLowerCase()) {
                return "context-menu-icon-checked";
              }
            }
          },
        }
      },
      insertSeparator: {
        name: messenger.i18n.getMessage("mnuInsSeparator"),
        className: "ae-menuitem",
        disabled(aKey, aOpt) {
          let tree = getClippingsTree();
          let selectedNode = tree.activeNode;

          if (! selectedNode) {
            return false;
          }

          if (isSeparatorSelected()) {
            return true;
          }
        }
      },
      separator0: "--------",
      deleteItem: {
        name: messenger.i18n.getMessage("tbDelete"),
        className: "ae-menuitem",
        disabled: function (aKey, aOpt) {
          let tree = getClippingsTree();
          let selectedNode = tree.activeNode;

          if (! selectedNode) {
            return false;
          }

          let folderID = parseInt(selectedNode.key);
          return (selectedNode.isFolder() && folderID == gPrefs.syncFolderID);
        }
      }
    }
  });

  aeInterxn.initContextMenuAriaRoles(".clippings-tree-cxt-menu");
  
  if (gPrefs.syncClippings) {
    initSyncedClippingsTree();
  }
}


function buildClippingsTreeHelper(aFolderID)
{
  let rv = [];

  return new Promise((aFnResolve, aFnReject) => {
    gClippingsDB.transaction("r", gClippingsDB.folders, gClippingsDB.clippings, () => {
      gClippingsDB.folders.where("parentFolderID").equals(aFolderID).each(async (aItem, aCursor) => {
        let folderNode = {
          key: aItem.id + "F",
          title: sanitizeTreeNodeTitle(DEBUG_TREE ? `${aItem.name} [key=${aItem.id}F]` : aItem.name),
          folder: true
        }

        if (aItem.id == gPrefs.syncFolderID) {
          folderNode.extraClasses = "ae-synced-clippings-fldr";
          if (gPrefs.isSyncReadOnly) {
            folderNode.extraClasses += " ae-synced-clippings-readonly";
          }
        }

        if ("displayOrder" in aItem) {
          folderNode.displayOrder = aItem.displayOrder;
        }
        else {
          folderNode.displayOrder = 0;
        }

        if ("sid" in aItem) {
          folderNode.sid = aItem.sid;
        }
        
        let childNodes = await buildClippingsTreeHelper(aItem.id);
        folderNode.children = childNodes;
        rv.push(folderNode);
      }).then(() => {
        return gClippingsDB.clippings.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
          let clippingNode = {
            key: aItem.id + "C",
            title: sanitizeTreeNodeTitle(DEBUG_TREE ? `${aItem.name} [key=${aItem.id}C]` : aItem.name)
          };
          if (aItem.label) {
            clippingNode.extraClasses = `ae-clipping-label-${aItem.label}`;
          }

          if ("displayOrder" in aItem) {
            clippingNode.displayOrder = aItem.displayOrder;
          }
          else {
            clippingNode.displayOrder = 0;
          }

          if (aItem.separator) {
            clippingNode.title = "<hr>";
            clippingNode.extraClasses = "ae-separator";
          }

          rv.push(clippingNode);
        });
      }).then(() => {
        rv.sort((aItem1, aItem2) => {
          let rv = 0;
          if ("displayOrder" in aItem1 && "displayOrder" in aItem2) {
            rv = aItem1.displayOrder - aItem2.displayOrder;
          }
          return rv;
        });

        aFnResolve(rv);
      });
    }).catch(aErr => {
      console.error("Clippings: clippingsMgr/pg.js: buildClippingsTreeHelperEx(): %s", aErr.message);
      aFnReject(aErr);
    });
  });
}


async function rebuildClippingsTree()
{
  let tree = getClippingsTree();
  let treeData = [];

  buildClippingsTreeHelper(aeConst.ROOT_FOLDER_ID).then(aTreeData => {
    if (aTreeData.length == 0) {
      if (! gIsClippingsTreeEmpty) {
        treeData = setEmptyClippingsState();
        tree.options.icon = false;
        tree.reload(treeData);
      }
      return null;
    }
    else {
      if (gIsClippingsTreeEmpty) {
        unsetEmptyClippingsState();
      }
      else {
        tree.clear();
      }
      treeData = aTreeData;
      return tree.reload(treeData);
    }

  }).then(aTreeData => {
    if (aTreeData) {
      gCmd.updateDisplayOrder(aeConst.ROOT_FOLDER_ID, null, null, true);
    }

    if (gPrefs.syncClippings) {
      gSyncedItemsIDs.clear();
      initSyncItemsIDLookupList();
      initSyncedClippingsTree();

      if (gPrefs.cxtMenuSyncItemsOnly) {
        if (gPrefs.clippingsMgrShowSyncItemsOnlyRem) {
          if (aeDialog.isOpen()) {
            gDialogs.showOnlySyncedItemsReminder.isDelayedOpen = true;
          }
          else {
            gDialogs.showOnlySyncedItemsReminder.showModal();
          }
        }
      }
      else {
        $("#clippings-tree").removeClass("cxt-menu-show-sync-items-only");
      }
    }
    
    return Promise.resolve(aTreeData);
  });
}


function initSyncedClippingsTree()
{
  gReloadSyncFldrBtn.show();
  $(".ae-synced-clippings-fldr").parent().addClass("ae-synced-clippings");

  if (gPrefs.cxtMenuSyncItemsOnly) {
    $("#clippings-tree").addClass("cxt-menu-show-sync-items-only");
  }
}


function initSyncItemsIDLookupList()
{
  function initSyncItemsIDLookupListHelper(aFolderID)
  {
    return new Promise((aFnResolve, aFnReject) => {
      gClippingsDB.transaction("r", gClippingsDB.clippings, gClippingsDB.folders, () => {
        gClippingsDB.folders.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
          gSyncedItemsIDs.add(`${aItem.id}F`);

          // Initialize permanent ID of synced folder.
          let sid = aItem.sid;
          gSyncedItemsIDMap.set(sid, `${aItem.id}F`);
          initSyncItemsIDLookupListHelper(aItem.id);
          
        }).then(() => {
          return gClippingsDB.clippings.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
            gSyncedItemsIDs.add(`${aItem.id}C`);

            // Initialize permanent ID of synced clipping, similar to what was
            // done above for folders.
            let sid = aItem.sid;
            gSyncedItemsIDMap.set(sid, `${aItem.id}C`);
          });

        }).then(() => {
          aFnResolve();
        });
      }).catch(aErr => {
        aFnReject(aErr);
      });
    });    
  }
  // END nested helper function

  return new Promise((aFnResolve, aFnReject) => {
    if (! gPrefs.syncClippings) {
      aFnResolve();
    }

    // Include the ID of the root Synced Clippings folder.
    gSyncedItemsIDs.add(`${gPrefs.syncFolderID}F`);

    initSyncItemsIDLookupListHelper(gPrefs.syncFolderID).then(() => {
      if (gCmd.undoStack.length > 0) {
        gCmd.undoStack.refreshSyncedItems();
      }
      if (gCmd.redoStack.length > 0) {
        gCmd.redoStack.refreshSyncedItems();
      }
      
      aFnResolve();
    }).catch(aErr => {
      aFnReject(aErr);
    });
  });
}


function initTreeSplitter()
{
  // Adapted from https://codepen.io/lingtalfi/pen/zoNeJp
  // Requires Simple Drag library: https://github.com/lingtalfi/simpledrag
  var leftPane = document.getElementById("clippings-tree");
  var rightPane = document.getElementById("item-properties");
  var paneSep = document.getElementById("tree-splitter");

  // The script below constrains the target to move horizontally between a left and a right
  // virtual boundaries.
  // - the left limit is positioned at 10% of the screen width
  // - the right limit is positioned at 60% of the screen width
  var leftLimit = 10;
  var rightLimit = 60;

  paneSep.sdrag(function (el, pageX, startX, pageY, startY, fix) {

    fix.skipX = true;

    if (pageX < window.innerWidth * leftLimit / 100) {
      pageX = window.innerWidth * leftLimit / 100;
      fix.pageX = pageX;
    }
    if (pageX > window.innerWidth * rightLimit / 100) {
      pageX = window.innerWidth * rightLimit / 100;
      fix.pageX = pageX;
    }

    var cur = pageX / window.innerWidth * 100;
    if (cur < 0) {
      cur = 0;
    }
    if (cur > window.innerWidth) {
      cur = window.innerWidth;
    }


    var right = (100-cur-2);
    leftPane.style.width = cur + '%';
    rightPane.style.width = right + '%';

  }, null, 'horizontal');
}


function setEmptyClippingsState()
{
  let rv = [
    {title: messenger.i18n.getMessage("clipMgrNoItems"), key: "0"}
  ];

  gIsClippingsTreeEmpty = true;
  $("#move, #delete").prop("disabled", true);
  $("#clipping-name, #clipping-text, #placeholder-toolbar, #options-bar").hide();
  $("#intro-content").show();
  
  return rv;
}


function unsetEmptyClippingsState()
{
  let tree = getClippingsTree();
  let emptyMsgNode = tree.getNodeByKey("0");
  emptyMsgNode.remove();
  tree.options.icon = true;
  gIsClippingsTreeEmpty = false;
  $("#intro-content").hide();
  $("#clipping-name, #clipping-text").show();

  if (gPrefs.clippingsMgrDetailsPane) {
    $("#options-bar").show();
  }
  if (gPrefs.clippingsMgrPlchldrToolbar) {
    $("#placeholder-toolbar").show();
  }
}


function sanitizeTreeNodeTitle(aNodeTitle)
{
  let rv = "";
  rv = sanitizeHTML(aNodeTitle);
  rv = rv.replace(/</g, "&lt;");
  rv = rv.replace(/>/g, "&gt;");
  
  return rv;
}


function initShortcutKeyMenu()
{
  $("#clipping-key").change(aEvent => {
    let shortcutKeyMenu = aEvent.target;
    let shortcutKey = "";
    
    if (shortcutKeyMenu.selectedIndex != 0) {
      shortcutKey = shortcutKeyMenu.options[shortcutKeyMenu.selectedIndex].text;
    }

    // Check if the shortcut key is already assigned.
    let assignedKeysLookup = {};
    gClippingsDB.clippings.where("shortcutKey").notEqual("").each((aItem, aCursor) => {
      assignedKeysLookup[aItem.shortcutKey] = 1;
    }).then(() => {
      if (assignedKeysLookup[shortcutKey]) {
        gDialogs.shctKeyConflict.showModal();
        return;
      }

      let selectedNode = getClippingsTree().getActiveNode();
      if (! selectedNode) {
        console.warn("Can't set shortcut key if there is no clipping selected.");
        return;
      }

      let clippingID = parseInt(selectedNode.key);
      gClippingsSvc.updateClipping(clippingID, { shortcutKey });
    });
  });
}


function isFolderSelected()
{
  let selectedNode = getClippingsTree().activeNode;

  if (! selectedNode) {
    return undefined;
  }
  return selectedNode.isFolder();
}


function isSeparatorSelected()
{
  let selectedNode = getClippingsTree().activeNode;

  if (! selectedNode) {
    return undefined;
  }
  return selectedNode.extraClasses == "ae-separator";
}


function updateDisplay(aEvent, aData)
{
  if (gIsClippingsTreeEmpty) {
    $("#move, #delete").prop("disabled", true);
    $("#options-bar").hide();
    setStatusBarMsg(messenger.i18n.getMessage("clipMgrStatusBar", "0"));
    return;
  }

  log("Clippings: clippingsMgr/pg.js: Updating display...");

  if (gSearchBox.isActivated()) {
    gSearchBox.updateSearch();
    let numMatches = gSearchBox.getCountMatches();
    if (numMatches !== undefined) {
      setStatusBarMsg(messenger.i18n.getMessage("numMatches", numMatches));
    }
  }
  else {
    setStatusBarMsg();
  }

  let selectedItemID = parseInt(aData.node.key);

  if (aData.node.isFolder()) {
    $("#move, #delete, #clipping-name").prop("disabled", false);

    gClippingsDB.folders.get(selectedItemID).then(aResult => {
      $("#clipping-name").val(aResult.name);
      $("#clipping-text").val("").hide();

      $("#options-bar, #placeholder-toolbar").hide();
      $("#clipping-src-url").text("");
      let shortcutKeyMenu = $("#clipping-key")[0];
      shortcutKeyMenu.selectedIndex = 0;

      $("#item-properties").addClass("folder-only");

      if (gPrefs.syncClippings) {
        // Prevent moving, deleting or renaming of the Synced Clippings folder.
        // Also disable editing if this is a synced item and the sync data
        // is read-only.
        if (selectedItemID == gPrefs.syncFolderID) {
          $("#move, #delete, #clipping-name").prop("disabled", true);
        }
        else if (gSyncedItemsIDs.has(selectedItemID + "F") && gPrefs.isSyncReadOnly) {
          // Allow the Move/Copy toolbar button to be enabled, since copying
          // a read-only synced item is permitted.
          $("#delete, #clipping-name").prop("disabled", true);
        }
      }
      else {
        $("#move, #delete, #clipping-name").prop("disabled", false);
      }
    });
  }
  else {
    $("#item-properties").removeClass("folder-only");
    $(`#clipping-name, #clipping-text, #clipping-key, #clipping-label-picker,
       #placeholder-toolbar > button`).prop("disabled", false);
    $("#options-bar label, #placeholder-toolbar label").removeAttr("disabled");
    
    gClippingsDB.clippings.get(selectedItemID).then(aResult => {
      $("#clipping-name").val(aResult.name);

      if (aResult.separator) {
        $("#move").prop("disabled", true);
        $("#delete").prop("disabled", false);
        $("#item-properties").addClass("folder-only");
        $("#clipping-name").prop("disabled", true);
        $("#clipping-text").val("").hide();
        $("#options-bar, #placeholder-toolbar").hide();
      }
      else {
        $("#move, #delete").prop("disabled", false);
        $("#clipping-text").val(aResult.content).show();

        if (gPrefs.clippingsMgrDetailsPane) {
          $("#options-bar").show();
        }

        if (gPrefs.clippingsMgrPlchldrToolbar) {
          $("#placeholder-toolbar").show();
        }
        
        let shortcutKeyMenu = $("#clipping-key")[0];
        shortcutKeyMenu.selectedIndex = 0;
        
        for (let i = 0; i < shortcutKeyMenu.options.length; i++) {
          if (shortcutKeyMenu[i].text == aResult.shortcutKey) {
            shortcutKeyMenu.selectedIndex = i;
            break;
          }
        }

        gClippingLabelPicker.selectedLabel = aResult.label;
      }

      // Disable editing if this is a synced item and the sync data is
      // read-only. But allow the Move/Copy toolbar button to be enabled,
      // since copying a read-only synced item is permitted.
      if (gSyncedItemsIDs.has(selectedItemID + "C") && gPrefs.isSyncReadOnly) {
        $("#delete").prop("disabled", true);
        $(`#clipping-name, #clipping-text, #clipping-key, #clipping-label-picker,
           #placeholder-toolbar > button`).prop("disabled", true);
        $("#options-bar label, #placeholder-toolbar label").attr("disabled", "");
      }
    });
  }
}


function insertTextIntoTextbox(aTextboxElt, aInsertedText)
{
  let text, pre, post, pos;
  let textbox = aTextboxElt[0];
  
  text = textbox.value;

  if (textbox.selectionStart == textbox.selectionEnd) {
    var point = textbox.selectionStart;
    pre = text.substring(0, point);
    post = text.substring(point, text.length);
    pos = point + aInsertedText.length;
  }
  else {
    var p1 = textbox.selectionStart;
    var p2 = textbox.selectionEnd;
    pre = text.substring(0, p1);
    post = text.substring(p2, text.length);
    pos = p1 + aInsertedText.length;
  }

  textbox.value = pre + aInsertedText + post;
  textbox.selectionStart = pos;
  textbox.selectionEnd = pos;

  if (gPrefs.clippingsUnchanged) {
    aePrefs.setPrefs({ clippingsUnchanged: false });
  }
}


function recalcContentAreaHeight(aIsStatusBarVisible)
{
  let statusBarHgt = aIsStatusBarVisible ? "var(--statusbar-height)" : "0px";
  $("#content").css({ height: `calc(100% - var(--toolbar-height) - ${statusBarHgt})`});
}


function setStatusBarMsg(aMessage)
{
  if (aMessage) {
    $("#status-bar-msg").text(aMessage);
    return;
  }

  let tree = getClippingsTree();
  $("#status-bar-msg").text(messenger.i18n.getMessage("clipMgrStatusBar", tree.count()));
}


async function saveWindowGeometry()
{
  // Save the Clippings Manager tree width.
  let treeWidth = parseInt($("#clippings-tree").css("width"));
  if (treeWidth != gPrefs.clippingsMgrTreeWidth) {
    let clippingsMgrTreeWidth = treeWidth;
    await aePrefs.setPrefs({ clippingsMgrTreeWidth });
  }

  let scrWidth = window.screen.availWidth;

  // Stop saving window geometry if window is maximized, due to bugs/limitations
  // with detecting and getting geometry of maximized windows.
  if (window.outerWidth >= scrWidth) {
    warn("Clippings: clippingsMgr/pg.js: saveWindowGeometry(): Not saving window geometry for maximized window.");
    return;
  }

  let savedWndGeom = gPrefs.clippingsMgrWndGeom;

  if (!savedWndGeom || savedWndGeom.w != window.outerWidth
      || savedWndGeom.h != window.outerHeight
      || savedWndGeom.x != window.screenX || savedWndGeom.y != window.screenY) {
    let clippingsMgrWndGeom = {
      w: window.outerWidth, h: window.outerHeight,
      x: window.screenX, y: window.screenY,
    };

    log("Clippings: clippingsMgr/pg.js: saveWindowGeometry():");
    log(clippingsMgrWndGeom);

    await aePrefs.setPrefs({ clippingsMgrWndGeom });
  }
}


function setSaveWndGeometryInterval(aSaveWndGeom)
{
  if (aSaveWndGeom) {
    setSaveWndGeometryInterval.intvID = setInterval(async () => {
      await saveWindowGeometry();
    }, gPrefs.clippingsMgrSaveWndGeomIntv);    
  }
  else {
    if (!! setSaveWndGeometryInterval.intvID) {
      clearInterval(setSaveWndGeometryInterval.intvID);
      setSaveWndGeometryInterval.intvID = null;
    }
  }
}
setSaveWndGeometryInterval.intvID = null;


async function focusWnd()
{
  await messenger.windows.update(messenger.windows.WINDOW_ID_CURRENT, {focused: true});
}


function closeWnd()
{
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}


function showBanner(aMessage)
{
  let bannerElt = $("#banner");
  let bannerMsgElt = $("#banner-msg");

  bannerMsgElt.children().remove();
  bannerMsgElt.text(aMessage);
  bannerElt.css("display", "block");
}


//
// DOM Utility
//

function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, {SAFE_FOR_JQUERY: true});
}


//
// Error reporting and debugging output
//

function showInitError()
{
  let errorMsgBox = new aeDialog("#init-error-msgbox");
  errorMsgBox.onInit = () => {
    $("#init-error-msgbox > .dlg-content > .msgbox-error-msg").text(messenger.i18n.getMessage("initError"));
  };
  errorMsgBox.onAccept = () => {
    closeWnd();
  };

  errorMsgBox.showModal();
}


function getErrStr(aErr)
{
  let rv = `${aErr.name}: ${aErr.message}`;

  if (aErr.fileName) {
    rv += "\nSource: " + aErr.fileName;
  }
  else {
    rv += "\nSource: unknown";
  }

  if (aErr.lineNumber) {
    rv += ":" + aErr.lineNumber;
  }

  return rv;
}


function handlePushSyncItemsError(aError)
{
  if (!gErrorPushSyncItems) {
    // Show sync errors only once during the Clippings Manager session.
    // Pushing sync changes can happen numerous times, and repeated error
    // messages will annoy the user.
    let errorMsgBox = new aeDialog("#sync-error-msgbox");
    errorMsgBox.onInit = function () {
      this.find(".dlg-content > .msgbox-error-msg").text(messenger.i18n.getMessage("syncPushFailed"));
    };
    errorMsgBox.showModal();
    gErrorPushSyncItems = true;
  }
}


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}


function info(aMessage)
{
  if (aeConst.DEBUG) { console.info(aMessage); }
}


function warn(aMessage)
{
  if (aeConst.DEBUG) { console.warn(aMessage); }
}
