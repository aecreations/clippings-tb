/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const ROOT_FOLDER_NAME = "clippings-root";

let gHostAppName;
let gHostAppVer;
let gOS;
let gClippingsDB;
let gIsDirty = false;
let gClippingMenuItemIDMap = {};
let gFolderMenuItemIDMap = {};
let gSyncFldrID = null;
let gClippingsMgrRootFldrReseq = false;

let gClippingsListeners = new aeListeners();

let gClippingsListener = {
  _isImporting: false,
  _isCopying: false,
  _isClippingsMgrDnDInProgress: false,
  origin: null,

  newClippingCreated: function (aID, aData, aOrigin)
  {
    if (this._isCopying) {
      log("Clippings/mx: gClippingsListener.newClippingCreated(): Copying in progress; ignoring DB changes.");
      return;
    }

    if (gIsReloadingSyncFldr) {
      log("Clippings/mx: gClippingsListener.newClippingCreated(): The Synced Clippings folder is being reloaded. Ignoring DB changes.");
      return;
    }

    rebuildContextMenu();
  },

  newFolderCreated: function (aID, aData, aOrigin)
  {
    if (this._isCopying) {
      log("Clippings/mx: gClippingsListener.newFolderCreated(): Copying in progress; ignoring DB changes.");
      return;
    }

    if (gIsReloadingSyncFldr || "isSync" in aData) {
      log("Clippings/mx: gClippingsListener.newFolderCreated(): The Synced Clippings folder is being reloaded. Ignoring DB changes.");
      return;
    }

    rebuildContextMenu();
  },

  clippingChanged: function (aID, aData, aOldData)
  {
    if (this._isClippingsMgrDnDInProgress) {
      return;
    }

    log("Clippings/mx: gClippingsListener.clippingChanged()");

    if (aData.name != aOldData.name || aData.parentFolderID != aOldData.parentFolderID
       || aData.label != aOldData.label) {
      rebuildContextMenu();
    }
  },

  folderChanged: function (aID, aData, aOldData)
  {
    if (this._isClippingsMgrDnDInProgress) {
      return;
    }

    log("Clippings/mx: gClippingsListener.folderChanged()");

    if ("isSync" in aOldData) {
      log("The Synced Clippings folder is being converted to a normal folder. Ignoring DB changes.");
      return;
    }

    if (aData.parentFolderID == aOldData.parentFolderID) {
      updateContextMenuForFolder(aID);
    }
    else {
      rebuildContextMenu();
    }
  },

  clippingDeleted: function (aID, aOldData) {},
  folderDeleted: function (aID, aOldData) {},

  copyStarted: function ()
  {
    this._isCopying = true;
  },

  copyFinished: function (aItemCopyID)
  {
    this._isCopying = false;
    rebuildContextMenu();
  },

  dndMoveStarted: function ()
  {
    this._isClippingsMgrDnDInProgress = true;
  },

  dndMoveFinished: function ()
  {
    this._isClippingsMgrDnDInProgress = false;
  },

  importStarted: function ()
  {
    log("Clippings/mx: gClippingsListener.importStarted()");
    this._isImporting = true;
  },

  importFinished: function (aIsSuccess)
  {
    log("Clippings/mx: gClippingsListener.importFinished()");
    this._isImporting = false;

    if (aIsSuccess) {
      log("Import was successful - proceeding to rebuild Clippings menu.");
      rebuildContextMenu();
    }
  },
};

let gNewClipping = {
  _name: null,
  _content: null,

  set: function (aNewClipping) {
    this._name = aNewClipping.name;
    this._content = aNewClipping.content;
  },

  get: function () {
    let rv = this.copy();
    this.reset();

    return rv;
  },

  copy: function () {
    let rv = { name: this._name, content: this._content };
    return rv;
  },
  
  reset: function () {
    this._name = null;
    this._content = null;
  }
};

let gWndIDs = {
  newClipping: null,
  clippingsMgr: null,
};

let gDefaultPrefs = {
  checkSpelling: true,
  clippingsMgrAutoShowDetailsPane: true,
  clippingsMgrDetailsPane: false,
  clippingsMgrStatusBar: false,
  clippingsMgrPlchldrToolbar: false,
  clippingsMgrMinzWhenInactv: undefined,
  syncClippings: false,
  syncFolderID: null,
  backupFilenameWithDate: true,
}
let gPrefs = null;
let gIsInitialized = false;
let gSetDisplayOrderOnRootItems = false;


messenger.runtime.onInstalled.addListener(async (aInstall) => {
  if (aInstall.reason == "install") {
    info("Clippings/mx: MailExtension installed.");

    await setDefaultPrefs();
    await init();
  }
  else if (aInstall.reason == "update") {
    let oldVer = aInstall.previousVersion;
    let currVer = messenger.runtime.getManifest().version;
    log(`Clippings/mx: Upgrading from version ${oldVer} to ${currVer}`);

    // TO DO: Check if Clippings was previously installed.
    // If so, migrate Clippings data from clippings.json.

    init();
  }
});


async function setDefaultPrefs()
{
  gPrefs = gDefaultPrefs;
  await messenger.storage.local.set(gDefaultPrefs);
}


messenger.runtime.onStartup.addListener(async () => {
  gPrefs = await messenger.storage.local.get(gDefaultPrefs);
  log("Clippings/mx: Successfully retrieved user preferences:");
  log(gPrefs);

  init();
});


function init()
{
  info("Clippings/mx: Initializing integration of MailExtension with host app...");

  initClippingsDB();

  let getMsgrInfo = messenger.runtime.getBrowserInfo();
  let getPlatInfo = messenger.runtime.getPlatformInfo();

  Promise.all([getMsgrInfo, getPlatInfo]).then(async (aResults) => {
    let msgr = aResults[0];
    let platform = aResults[1];
    
    gHostAppName = msgr.name;
    gHostAppVer = msgr.version;
    log(`Clippings/mx: Host app: ${gHostAppName} (version ${gHostAppVer})`);

    gOS = platform.os;
    log("Clippings/mx: OS: " + gOS);

    if (gPrefs.clippingsMgrMinzWhenInactv === undefined) {
      gPrefs.clippingsMgrMinzWhenInactv = (gOS == "linux");
    }

    initMessageListeners();

    messenger.storage.onChanged.addListener((aChanges, aAreaName) => {
      let changedPrefs = Object.keys(aChanges);

      for (let pref of changedPrefs) {
        gPrefs[pref] = aChanges[pref].newValue;
        /***
        if (pref == "autoIncrPlcHldrStartVal") {
          aeClippingSubst.setAutoIncrementStartValue(aChanges[pref].newValue);
        }
        else if (gPrefs.pasteShortcutKeyPrefix && !isDirectSetKeyboardShortcut()) {
          setShortcutKeyPrefix(gPrefs.pasteShortcutKeyPrefix);
        }
        ***/
      }
    });
    
    if (gSetDisplayOrderOnRootItems) {
      await setDisplayOrderOnRootItems();
      log("Clippings/mx: Display order on root folder items have been set.");
    }

    messenger.WindowListener.registerDefaultPrefs("legacy/defaults/preferences/prefs.js");

    messenger.WindowListener.registerChromeUrl([
      ["content",  "clippings", "legacy/chrome/content/"],
      ["locale",   "clippings", "en-US", "legacy/chrome/locale/en-US/"],
      ["resource", "clippings", "legacy/"]
    ]);
/**
    messenger.WindowListener.registerOptionsPage("chrome://clippings/content/preferences.xul");
**/
    messenger.WindowListener.registerWindow(
      "chrome://messenger/content/messenger.xhtml",
      "chrome://clippings/content/messenger.js"
    );
    messenger.WindowListener.registerWindow(
      "chrome://messenger/content/messengercompose/messengercompose.xhtml",
      "chrome://clippings/content/messengercompose.js"
    );
    
    messenger.WindowListener.startListening();

    gIsInitialized = true;
    log("Clippings/mx: MailExtension initialization complete.");    
  });
}


function initClippingsDB()
{
  gClippingsDB = new Dexie("aeClippings");
  gClippingsDB.version(1).stores({
    clippings: "++id, name, parentFolderID, shortcutKey",
    folders: "++id, name, parentFolderID"
  });

  gClippingsDB.open().catch(aErr => {
    console.error(aErr);
  });
}


async function setDisplayOrderOnRootItems()
{
  let seq = 1;

  gClippingsDB.transaction("rw", gClippingsDB.clippings, gClippingsDB.folders, () => {
    gClippingsDB.folders.where("parentFolderID").equals(aeConst.ROOT_FOLDER_ID).each((aItem, aCursor) => {
      log(`Clippings/mx: setDisplayOrderOnRootItems(): Folder "${aItem.name}" (id=${aItem.id}): display order = ${seq}`);
      let numUpd = gClippingsDB.folders.update(aItem.id, { displayOrder: seq++ });

    }).then(() => {
      return gClippingsDB.clippings.where("parentFolderID").equals(aeConst.ROOT_FOLDER_ID).each((aItem, aCursor) => {
        log(`Clippings/mx: setDisplayOrderOnRootItems(): Clipping "${aItem.name}" (id=${aItem.id}): display order = ${seq}`);
        let numUpd = gClippingsDB.clippings.update(aItem.id, { displayOrder: seq++ });
      });

    }).then(() => {
      Promise.resolve();
    });     

  }).catch(aErr => {
    console.error("Clippings/mx: setDisplayOrderOnRootItems(): " + aErr);
    Promise.reject(aErr);
  });
}


async function purgeFolderItems(aFolderID, aKeepFolder)
{
  gClippingsDB.transaction("rw", gClippingsDB.clippings, gClippingsDB.folders, () => {
    gClippingsDB.folders.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
      purgeFolderItems(aItem.id, false).then(() => {});

    }).then(() => {
      if (!aKeepFolder && aFolderID != aeConst.DELETED_ITEMS_FLDR_ID) {
        log("Clippings/mx: purgeFolderItems(): Deleting folder: " + aFolderID);
        return gClippingsDB.folders.delete(aFolderID);
      }
      return null;
      
    }).then(() => {
      return gClippingsDB.clippings.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
        log("Clippings/mx: purgeFolderItems(): Deleting clipping: " + aItem.id);
        gClippingsDB.clippings.delete(aItem.id);
      });
    }).then(() => {
      Promise.resolve();
    });
  }).catch(aErr => {
    Promise.reject(aErr);
  });
}


function initMessageListeners()
{
  messenger.runtime.onMessage.addListener(aRequest => {
    log(`Clippings/mx: Received message "${aRequest.msgID}"`);

    let resp = null;

    if (aRequest.msgID == "init-new-clipping-dlg") {
      resp = gNewClipping.get();

      if (resp !== null) {
        resp.checkSpelling = gPrefs.checkSpelling;
        return Promise.resolve(resp);
      }
    }
    else if (aRequest.msgID == "close-new-clipping-dlg") {
      gWndIDs.newClipping = null;
      gIsDirty = true;
    }
  });
}


async function getShortcutKeyPrefixStr()
{
  // TO DO: Finish implementation.

  // TEMPORARY
  return "ALT+SHIFT+Y";
}


function getContextMenuData(aFolderID = aeConst.ROOT_FOLDER_ID)
{
  function fnSortMenuItems(aItem1, aItem2)
  {
    let rv = 0;
    if ("displayOrder" in aItem1 && "displayOrder" in aItem2) {
      rv = aItem1.displayOrder - aItem2.displayOrder;
    }
    return rv;    
  }

  let rv = [];

  return new Promise((aFnResolve, aFnReject) => {
    gClippingsDB.transaction("r", gClippingsDB.folders, gClippingsDB.clippings, () => {
      gClippingsDB.folders.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
        let fldrMenuItemID = "ae-clippings-folder-" + aItem.id + "_" + Date.now();
        gFolderMenuItemIDMap[aItem.id] = fldrMenuItemID;

        let submenuItemData = {
          id: fldrMenuItemID,
          title: aItem.name,
        };

        // Submenu icon
        let iconPath = "img/folder.svg";
        if (aItem.id == gSyncFldrID) {
          iconPath = "img/synced-clippings.svg";
        }

        submenuItemData.icons = { 16: iconPath };

        if (! ("displayOrder" in aItem)) {
          submenuItemData.displayOrder = 0;
        }
        else {
          submenuItemData.displayOrder = aItem.displayOrder;
        }

        if (aFolderID != aeConst.ROOT_FOLDER_ID) {
          let parentFldrMenuItemID = gFolderMenuItemIDMap[aFolderID];
          submenuItemData.parentId = parentFldrMenuItemID;
        }

        getContextMenuData(aItem.id).then(aSubmenuData => {
          aSubmenuData.sort(fnSortMenuItems);
          submenuItemData.submenuItems = aSubmenuData;
          rv.push(submenuItemData);
        });

      }).then(() => {
        return gClippingsDB.clippings.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
          let menuItemID = "ae-clippings-clipping-" + aItem.id + "_" + Date.now();
          gClippingMenuItemIDMap[aItem.id] = menuItemID;

          let menuItemData = {
            id: menuItemID,
            title: aItem.name,
          };

          if (aItem.label) {
            menuItemData.label = aItem.label;
          }

          if (! ("displayOrder" in aItem)) {
            menuItemData.displayOrder = 0;
          }
          else {
            menuItemData.displayOrder = aItem.displayOrder;
          }
          
          if (aFolderID != aeConst.ROOT_FOLDER_ID) {
            let fldrMenuItemID = gFolderMenuItemIDMap[aFolderID];
            menuItemData.parentId = fldrMenuItemID;
          }

          rv.push(menuItemData);
        });
      }).then(() => {
        rv.sort(fnSortMenuItems);

        log("Clippings/mx::getContextMenuData():");
        log(rv);

        aFnResolve(rv);
      });
    }).catch(aErr => {
      console.error("Clippings/mx::getContextMenuData(): Exception thrown: " + aErr);
      aFnReject(aErr);
    });
  });
}


function updateContextMenuForFolder(aUpdatedFolderID)
{
  let id = Number(aUpdatedFolderID);
  gClippingsDB.folders.get(id).then(aResult => {
    let menuItemID = gFolderMenuItemIDMap[id];
    if (menuItemID) {
      gIsDirty = true;
    }
  });
}


function rebuildContextMenu()
{
  gIsDirty = true;
}


function createClippingNameFromText(aText)
{
  let rv = "";
  let clipName = "";

  aText = aText.trim();

  if (aText.length > aeConst.MAX_NAME_LENGTH) {
    // Leave room for the three-character elipsis.
    clipName = aText.substr(0, aeConst.MAX_NAME_LENGTH - 3) + "...";
  } 
  else {
    clipName = aText;
  }

  // Truncate clipping names at newlines if they exist.
  let newlineIdx = clipName.indexOf("\n");
  rv = (newlineIdx == -1) ? clipName : clipName.substring(0, newlineIdx);

  return rv;
}


async function openClippingsManager(aBackupMode)
{
  let clippingsMgrURL = messenger.runtime.getURL("pages/clippingsMgr.html");

  let msgrWnd = await messenger.windows.getCurrent();
  clippingsMgrURL += "?openerWndID=" + msgrWnd.id;

  if (aBackupMode) {
    clippingsMgrURL += "&backupMode=1";
  }
  
  async function openClippingsMgrHelper()
  {
    let wndInfo = {
      url: clippingsMgrURL,
      type: "detached_panel",
      width: 750, height: 400,
      left:  64,  top: 128,
    };

    let wnd = await messenger.windows.create(wndInfo);
    gWndIDs.clippingsMgr = wnd.id;
  }
  
  if (gWndIDs.clippingsMgr) {
    try {
      await messenger.windows.get(gWndIDs.clippingsMgr);
      messenger.windows.update(gWndIDs.clippingsMgr, { focused: true });
    }
    catch (e) {
      // Handle dangling ref to previously-closed Clippings Manager window
      // because it was closed before it finished initializing.
      gWndIDs.clippingsMgr = null;
      openClippingsMgrHelper();
    }
  }
  else {
    openClippingsMgrHelper();
  }
}


function openNewClippingDlg(aNewClippingContent)
{
  if (aNewClippingContent) {
    let name = createClippingNameFromText(aNewClippingContent);
    gNewClipping.set({ name, content: aNewClippingContent });
  }
  
  let url = messenger.runtime.getURL("pages/new.html");
  let height = 390;
  if (gOS == "win") {
    height = 420;
  }
  openDlgWnd(url, "newClipping", { type: "detached_panel", width: 428, height });
}


async function openDlgWnd(aURL, aWndKey, aWndPpty)
{
  async function openDlgWndHelper()
  {
    let wnd = await messenger.windows.create({
      url: aURL,
      type: aWndPpty.type,
      width: aWndPpty.width,
      height: aWndPpty.height,
      left: window.screen.availWidth - aWndPpty.width / 2,
      top:  window.screen.availHeight - aWndPpty.height / 2
    });

    gWndIDs[aWndKey] = wnd.id;
  }

  if (gWndIDs[aWndKey]) {
    try {
      await messenger.windows.get(gWndIDs[aWndKey]);
      messenger.windows.update(gWndIDs[aWndKey], { focused: true });
    }
    catch (e) {
      gWndIDs[aWndKey] = null;
      openDlgWndHelper();
    };
  }
  else {
    openDlgWndHelper();
  }
}


function getClipping(aClippingID)
{
  return new Promise((aFnResolve, aFnReject) => {
    gClippingsDB.transaction("r", gClippingsDB.clippings, gClippingsDB.folders, () => {
      let clipping = null;
      
      gClippingsDB.clippings.get(aClippingID).then(aClipping => {
        if (! aClipping) {
          throw new Error("Cannot find clipping with ID = " + aClippingID);
        }

        if (aClipping.parentFolderID == -1) {
          throw new Error("Attempting to paste a deleted clipping!");
        }

        clipping = aClipping;
        log(`Pasting clipping named "${clipping.name}"\nid = ${clipping.id}`);
        
        return gClippingsDB.folders.get(aClipping.parentFolderID);
      }).then(aFolder => {
        let parentFldrName = "";
        if (aFolder) {
          parentFldrName = aFolder.name;
        }
        else {
          parentFldrName = ROOT_FOLDER_NAME;
        }
        let clippingInfo = {
          id: clipping.id,
          name: clipping.name,
          text: clipping.content,
          parentFolderName: parentFldrName
        };

        log(`Clippings/mx::getClipping(): Retrieved clipping (ID = ${aClippingID}):`);
        log(clippingInfo);
        
        aFnResolve(clippingInfo);
      });
    }).catch(aErr => {
      console.error("Clippings/mx: getClipping(): " + aErr);
      aFnReject(aErr);
    });
  });
}


function getShortcutKeyMap()
{
  let rv = new Map();
  
  return new Promise((aFnResolve, aFnReject) => {
    gClippingsDB.clippings.where("shortcutKey").notEqual("").each((aItem, aCursor) => {
      let key = aItem.shortcutKey;
      let value = {
        id: aItem.id,
        name: aItem.name,
        text: aItem.content,
      };
      rv.set(key, value);

    }).then(() => {
      aFnResolve(rv);
    });
  });
}


//
// Utility functions
//

function getClippingsDB()
{
  return gClippingsDB;
}


function verifyDB()
{
  return new Promise((aFnResolve, aFnReject) => {
    let numClippings;

    gClippingsDB.clippings.count(aNumItems => {
      numClippings = aNumItems;
    }).then(() => {
      aFnResolve(numClippings);
    }).catch(aErr => {
      aFnReject(aErr);
    });
  });
}


function getOS()
{
  return gOS;
}

function getHostAppName()
{
  return gHostAppName;
}

function getClippingsListeners()
{
  return gClippingsListeners.getListeners();
}

function addClippingsListener(aListener)
{
  gClippingsListeners.add(aListener);
}

function removeClippingsListener(aListener)
{
  gClippingsListeners.remove(aListener);
}

function getPrefs()
{
  return gPrefs;
}

function getSyncFolderID()
{
  // TEMPORARY
  return -11;
  /***
  return gSyncFldrID;
  ***/
}

function isClippingsMgrRootFldrReseq()
{
  return gClippingsMgrRootFldrReseq;
}

function setClippingsMgrRootFldrReseq(aReseqOnReload)
{
  gClippingsMgrRootFldrReseq = aReseqOnReload;
}

function isDirty()
{
  return gIsDirty;
}

function setDirtyFlag(aFlag)
{
  if (aFlag === undefined) {
    gIsDirty = true
  }
  else {
    gIsDirty = aFlag;
  }
}


//
// Catch any unhandled promise rejections from 3rd-party libs
//

window.addEventListener("unhandledrejection", aEvent => {
  aEvent.preventDefault();
});


//
// Error reporting and debugging output
//

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
