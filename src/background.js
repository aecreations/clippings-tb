/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const ROOT_FOLDER_NAME = "clippings-root";

let gClippingsDB;
let gHostAppName;
let gHostAppVer;
let gOS;
let gIsDirty = false;
let gClippingMenuItemIDMap = {};
let gFolderMenuItemIDMap = {};
let gSyncFldrID = null;
let gBackupRemIntervalID = null;
let gIsReloadingSyncFldr = false;
let gSyncClippingsHelperDwnldPgURL;
let gForceShowFirstTimeBkupNotif = false;
let gMigrateLegacyData = false;
let gClippingsMgrCleanUpIntvID = null;

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

let gSyncClippingsListeners = new aeListeners();

let gSyncClippingsListener = {
  onActivate(aSyncFolderID) {},

  onDeactivate(aOldSyncFolderID)
  {
    log("Clippings/mx: gSyncClippingsListener.onDeactivate()");

    if (gPrefs.cxtMenuSyncItemsOnly) {
      return;
    }
  },

  onAfterDeactivate(aRemoveSyncFolder, aOldSyncFolderID)
  {
    function resetCxtMenuSyncItemsOnlyOpt(aRebuildCxtMenu) {
      if (gPrefs.cxtMenuSyncItemsOnly) {
        aePrefs.setPrefs({ cxtMenuSyncItemsOnly: false });
      }
      if (aRebuildCxtMenu) {
        rebuildContextMenu();
      }
    }

    log("Clippings/mx: gSyncClippingsListeners.onAfterDeactivate(): Remove Synced Clippings folder: " + aRemoveSyncFolder);

    if (aRemoveSyncFolder) {
      log(`Removing old Synced Clippings folder (ID = ${aOldSyncFolderID})`);
      purgeFolderItems(aOldSyncFolderID, false).then(() => {
        resetCxtMenuSyncItemsOnlyOpt(true);
      });
    }
    else {
      resetCxtMenuSyncItemsOnlyOpt();
    }
  },

  onReloadStart()
  {
    log("Clippings/mx: gSyncClippingsListeners.onReloadStart()");
    gIsReloadingSyncFldr = true;
  },
  
  onReloadFinish()
  {
    log("Clippings/mx: gSyncClippingsListeners.onReloadFinish(): Rebuilding Clippings menu");
    gIsReloadingSyncFldr = false;
    rebuildContextMenu();
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

let gPrefs = null;
let gIsInitialized = false;
let gSetDisplayOrderOnRootItems = false;


messenger.runtime.onInstalled.addListener(async (aInstall) => {
  if (aInstall.reason == "install") {
    info("Clippings/mx: MailExtension installed.");

    await setDefaultPrefs();
    init();
  }
  else if (aInstall.reason == "update") {
    let oldVer = aInstall.previousVersion;
    let currVer = messenger.runtime.getManifest().version;
    log(`Clippings/mx: Upgrading from version ${oldVer} to ${currVer}`);

    gPrefs = await aePrefs.getAllPrefs();

    if (! aePrefs.hasSantaBarbaraPrefs(gPrefs)) {
      await setDefaultPrefs();
      await migrateLegacyPrefs();
      gMigrateLegacyData = true;
    }

    if (! aePrefs.hasCarpinteriaPrefs(gPrefs)) {
      await aePrefs.setCarpinteriaPrefs(gPrefs);
    }

    init();
  }
});


messenger.runtime.onStartup.addListener(async () => {
  log("Clippings/mx: Initializing Clippings during browser startup.");
  
  gPrefs = await aePrefs.getAllPrefs();
  log("Clippings/mx: Successfully retrieved user preferences:");
  log(gPrefs);

  init();
});


async function setDefaultPrefs()
{
  let defaultPrefs = aePrefs.getDefaultPrefs();

  gPrefs = defaultPrefs;
  await aePrefs.setPrefs(defaultPrefs);
}


async function migrateLegacyPrefs()
{
  log("Clippings/mx: migrateLegacyPrefs()");

  let htmlPaste = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.html_paste", 0
  );
  let autoLineBreak = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.html_auto_line_break", true
  );
  let keyboardPaste = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.enable_keyboard_paste", true
  );
  let wxPastePrefixKey = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.enable_wx_paste_prefix_key", true
  );
  let pastePromptAction = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.paste_shortcut_mode", 1
  );
  let checkSpelling = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.check_spelling", true
  );
  let clippingsMgrDetailsPane = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.clipmgr.details_pane", false
  );
  let clippingsMgrPlchldrToolbar = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.clipmgr.placeholder_toolbar", false
  );
  let clippingsMgrStatusBar = await messenger.aeClippingsLegacy.getPref(
    "extensions.aecreations.clippings.clipmgr.status_bar", true
  );

  log(`Pref values:\nhtmlPaste = ${htmlPaste}\nautoLineBreak = ${autoLineBreak}\nkeyboardPaste = ${keyboardPaste}\nwxPastePrefixKey = ${wxPastePrefixKey}\npastePromptAction = ${pastePromptAction}\ncheckSpelling = ${checkSpelling}\nclippingsMgrDetailsPane = ${clippingsMgrDetailsPane}\nclippingsMgrPlchldrToolbar = ${clippingsMgrPlchldrToolbar}\nclippingsMgrStatusBar = ${clippingsMgrStatusBar}`);

  // The option to ask the user when pasting a formatted clipping is no longer
  // available - change default to always paste as rich text.
  if (htmlPaste == aeConst.HTMLPASTE_ASK_THE_USER) {
    htmlPaste = aeConst.HTMLPASTE_AS_FORMATTED;
  }
  
  aePrefs.setPrefs({
    htmlPaste, autoLineBreak, keyboardPaste, wxPastePrefixKey, pastePromptAction,
    checkSpelling, clippingsMgrDetailsPane, clippingsMgrPlchldrToolbar,
    clippingsMgrStatusBar
  });
}


function removeLegacyPrefs(aKeepDataSrcLocationPref)
{
  // Don't reset the data source location pref if legacy data migration failed;
  // keep the old pref for troubleshooting.
  if (! aKeepDataSrcLocationPref) {
    messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.datasource.location");
  }

  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.html_paste");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.html_auto_line_break");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.enable_keyboard_paste");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.enable_wx_paste_prefix_key");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.paste_shortcut_mode");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.tb78.show_warning");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.tb78.show_notice");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.tb78.show_anncmt");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.beep_on_error");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.first_run");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.v3.first_run");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.datasource.process_root");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.datasource.wx_sync.enabled");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.datasource.wx_sync.location");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.clipmgr.first_run");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.clipmgr.wnd_position");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.clipmgr.wnd_size");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.clipmgr.is_maximized");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.clipmgr.status_bar");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.clipmgr.placeholder_toolbar");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.clipmgr.details_pane");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.use_clipboard");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.migrate_common_ds_pref");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.migrated_prefs");
  messenger.aeClippingsLegacy.clearPref("extensions.aecreations.clippings.check_spelling");
}


async function init()
{
  info("Clippings/mx: Initializing integration of MailExtension with host app...");

  initClippingsDB();
  aeImportExport.setDatabase(gClippingsDB);

  if (gMigrateLegacyData) {
    let keepDataSrcLocnPref = false;
    
    try {
      await verifyDB();

      log("Clippings/mx: init(): Successfully verified Clippings DB.  Starting data migration...")
      await migrateClippingsData();
    }
    catch (e) {
      console.error("Clippings/mx: migrateClippingsData(): Failed to verify IndexedDB database - cannot migrate legacy Clippings data.");
      await aePrefs.setPrefs({
        legacyDataMigrnSuccess: false,
        showLegacyDataMigrnStatus: true,
      });
      keepDataSrcLocnPref = true;
    }

    removeLegacyPrefs(keepDataSrcLocnPref);
  }
  
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

    if (gOS == "linux" && gPrefs.clippingsMgrMinzWhenInactv === null) {
      await aePrefs.setPrefs({ clippingsMgrMinzWhenInactv: true });
    }

    if (gPrefs.autoAdjustWndPos === null) {
      let autoAdjustWndPos = gOS == "win";
      let clippingsMgrSaveWndGeom = autoAdjustWndPos;
      await aePrefs.setPrefs({ autoAdjustWndPos, clippingsMgrSaveWndGeom });
    }

    gClippingsListener.origin = aeConst.ORIGIN_HOSTAPP;
    gClippingsListeners.add(gClippingsListener);
    gSyncClippingsListeners.add(gSyncClippingsListener);

    if (gPrefs.syncClippings) {
      gSyncFldrID = gPrefs.syncFolderID;

      // The context menu will be built when refreshing the sync data, via the
      // onReloadFinish event handler of the Sync Clippings listener.
      refreshSyncedClippings(true);
    }
    
    if (gPrefs.backupRemFirstRun && !gPrefs.lastBackupRemDate) {
      aePrefs.setPrefs({
        lastBackupRemDate: new Date().toString(),
      });
    }

    // Check in 5 minutes whether to show backup reminder notification.
    window.setTimeout(
      async (aEvent) => { showBackupNotification() },
      aeConst.BACKUP_REMINDER_DELAY_MS
    );

    if (gPrefs.syncClippings && gPrefs.syncHelperCheckUpdates) {
      // Check for updates to Sync Clippings Helper native app in 10 minutes.
      window.setTimeout(showSyncHelperUpdateNotification, aeConst.SYNC_HELPER_CHECK_UPDATE_DELAY_MS);
    }

    if (gSetDisplayOrderOnRootItems) {
      if (gMigrateLegacyData) {
        window.setTimeout(async () => {
          await setDisplayOrderOnRootItems();
          log("Clippings/mx: Display order on root folder items have been set (after data source migration).");
        }, 3000);
      }
      else {
        await setDisplayOrderOnRootItems();
        log("Clippings/mx: Display order on root folder items have been set.");
      }
    }

    messenger.WindowListener.registerChromeUrl([
      ["content",  "clippings", "legacy/chrome/content/"],
      ["locale",   "clippings", "en-US", "legacy/chrome/locale/en-US/"],
      ["resource", "clippings", "legacy/"]
    ]);

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


async function migrateClippingsData()
{
  let clippingsJSONData = await messenger.aeClippingsLegacy.getClippingsFromJSONFile();

  if (clippingsJSONData === null) {
    throw new Error("Failed to retrieve data from clippings.json - file not found");
  }

  log("Clippings/mx: migrateClippingsData(): Migrating clippings from legacy data source");    
  aeImportExport.importFromJSON(clippingsJSONData, true, false);

  await aePrefs.setPrefs({
    legacyDataMigrnSuccess: true,
    showLegacyDataMigrnStatus: true,
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


async function enableSyncClippings(aIsEnabled)
{
  if (aIsEnabled) {
    log("Clippings/mx: enableSyncClippings(): Turning ON");

    if (gSyncFldrID === null) {
      log("Clippings/mx: enableSyncClippings(): Creating the Synced Clippings folder."); 
      let syncFldr = {
        name: messenger.i18n.getMessage("syncFldrName"),
        parentFolderID: aeConst.ROOT_FOLDER_ID,
        displayOrder: 0,
        isSync: true,
      };
      try {
        gSyncFldrID = await gClippingsDB.folders.add(syncFldr);
      }
      catch (e) {
        console.error("Clippings/mx: enableSyncClippings(): Failed to create the Synced Clipping folder: " + e);
      }

      await aePrefs.setPrefs({ syncFolderID: gSyncFldrID });
      log("Clippings/mx: enableSyncClippings(): Synced Clippings folder ID: " + gSyncFldrID);
      return gSyncFldrID;
    }
  }
  else {
    log("Clippings/mx: enableSyncClippings(): Turning OFF");
    let oldSyncFldrID = gSyncFldrID;

    let numUpd = await gClippingsDB.folders.update(gSyncFldrID, { isSync: undefined });
    await aePrefs.setPrefs({ syncFolderID: null });
    gSyncFldrID = null;
    return oldSyncFldrID;
  }
}


// TO DO: Make this an asynchronous function.
// This can only be done after converting aeImportExport.importFromJSON()
// to an asynchronous method.
function refreshSyncedClippings(aRebuildClippingsMenu)
{
  log("Clippings/mx: refreshSyncedClippings(): Retrieving synced clippings from the Sync Clippings helper app...");

  let msg = { msgID: "get-synced-clippings" };
  let getSyncedClippings = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
  let syncJSONData = "";

  getSyncedClippings.then(aResp => {
    if (aResp) {
      syncJSONData = aResp;
    }
    else {
      throw new Error("Clippings/mx: refreshSyncedClippings(): Response data from native app is invalid");
    }
    
    if (gSyncFldrID === null) {
      log("Clippings/mx: The Synced Clippings folder is missing. Creating it...");
      let syncFldr = {
        name: messenger.i18n.getMessage("syncFldrName"),
        parentFolderID: aeConst.ROOT_FOLDER_ID,
        displayOrder: 0,
      };
      
      return gClippingsDB.folders.add(syncFldr);
    }

    log("Clippings/mx: refreshSyncedClippings(): Synced Clippings folder ID: " + gSyncFldrID);
    return gSyncFldrID;

  }).then(aSyncFldrID => {
    if (gSyncFldrID === null) {
      gSyncFldrID = aSyncFldrID;
      log("Clippings/mx: Synced Clippings folder ID: " + gSyncFldrID);
      return aePrefs.setPrefs({ syncFolderID: gSyncFldrID });
    }
      
    gSyncClippingsListeners.getListeners().forEach(aListener => { aListener.onReloadStart() });

    log("Clippings/mx: Purging existing items in the Synced Clippings folder...");
    return purgeFolderItems(gSyncFldrID, true);

  }).then(() => {
    log("Clippings/mx: Importing clippings data from sync file...");

    // Method aeImportExport.importFromJSON() is asynchronous, so the import
    // may not yet be finished when this function has finished executing!
    aeImportExport.setDatabase(gClippingsDB);
    aeImportExport.importFromJSON(syncJSONData, false, false, gSyncFldrID);

    window.setTimeout(function () {
      gSyncClippingsListeners.getListeners().forEach(aListener => { aListener.onReloadFinish() });
    }, gPrefs.afterSyncFldrReloadDelay);
    
  }).catch(aErr => {
    console.error("Clippings/mx: refreshSyncedClippings(): " + aErr);
    if (aErr == aeConst.SYNC_ERROR_CONXN_FAILED) {
      showSyncErrorNotification();
    }
  });
}


async function pushSyncFolderUpdates()
{
  if (!gPrefs.syncClippings || gSyncFldrID === null) {
    throw new Error("Sync Clippings is not turned on!");
  }
  
  let syncData = await aeImportExport.exportToJSON(true, true, gSyncFldrID, false, true);
  let msg = {
    msgID: "set-synced-clippings",
    syncData: syncData.userClippingsRoot,
  };

  info("Clippings/mx: pushSyncFolderUpdates(): Pushing Synced Clippings folder updates to the Sync Clippings helper app. Message data:");
  log(msg);

  let msgResult;
  try {
    msgResult = await messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
  }
  catch (e) {
    console.error("Clippings/mx: pushSyncFolderUpdates(): " + e);
    throw e;
  }

  log("Clippings/mx: pushSyncFolderUpdates(): Response from native app:");
  log(msgResult);
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


async function getShortcutKeyPrefixStr()
{
  let rv = "";
  let keyAlt   = messenger.i18n.getMessage("keyAlt");
  let keyShift = messenger.i18n.getMessage("keyShift");
  let shctModeKeys = `${keyAlt}+${keyShift}+Y`;

  if (gOS == "mac") {
    let keyOption = messenger.i18n.getMessage("keyOption");
    let keyCmd = messenger.i18n.getMessage("keyCommand");
    shctModeKeys = `${keyOption}${keyCmd}V`;
  }
  rv = shctModeKeys;

  return rv;
}


function getClippingSearchData()
{
  let rv = [];
  
  return new Promise((aFnResolve, aFnReject) => {
    gClippingsDB.clippings.where("parentFolderID").notEqual(aeConst.DELETED_ITEMS_FLDR_ID)
      .each((aItem, aCursor) => {
        rv.push({
          clippingID: aItem.id,
          name: aItem.name,
          text: aItem.content,
        });
      }).then(() => {
        log("Clippings/mx: getClippingSearchData()");
        log(rv);
        
        aFnResolve(rv);
      });
  });
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
          submenuItemData.isSync = true;
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


async function showBackupNotification()
{
  if (gPrefs.backupRemFrequency == aeConst.BACKUP_REMIND_NEVER) {
    return;
  }

  let today = new Date();
  let lastBackupRemDate = new Date(gPrefs.lastBackupRemDate);
  let diff = new aeDateDiff(today, lastBackupRemDate);
  let numDays = 0;

  switch (gPrefs.backupRemFrequency) {
  case aeConst.BACKUP_REMIND_DAILY:
    numDays = 1;
    break;

  case aeConst.BACKUP_REMIND_TWODAYS:
    numDays = 2;
    break;

  case aeConst.BACKUP_REMIND_THREEDAYS:
    numDays = 3;
    break;

  case aeConst.BACKUP_REMIND_FIVEDAYS:
    numDays = 5;
    break;

  case aeConst.BACKUP_REMIND_TWOWEEKS:
    numDays = 14;
    break;

  case aeConst.BACKUP_REMIND_MONTHLY:
    numDays = 30;
    break;

  case aeConst.BACKUP_REMIND_WEEKLY:
  default:
    numDays = 7;
    break;
  }

  if (diff.days >= numDays || gForceShowFirstTimeBkupNotif) {
    if (gPrefs.backupRemFirstRun) {
      info("Clippings/mx: showBackupNotification(): Showing first-time backup reminder.");

      await messenger.notifications.create(aeConst.NOTIFY_BACKUP_REMIND_FIRSTRUN_ID, {
        type: "basic",
        title: messenger.i18n.getMessage("backupNotifyTitle"),
        message: messenger.i18n.getMessage("backupNotifyFirstMsg"),
        iconUrl: "img/icon.svg",
      });

      await aePrefs.setPrefs({
        backupRemFirstRun: false,
        backupRemFrequency: aeConst.BACKUP_REMIND_WEEKLY,
        lastBackupRemDate: new Date().toString(),
      });

      if (gForceShowFirstTimeBkupNotif) {
        setBackupNotificationInterval();
        gForceShowFirstTimeBkupNotif = false;
      }
    }
    else {
      info("Clippings/mx: showBackupNotification(): Last backup reminder: "
           + gPrefs.lastBackupRemDate);

      await messenger.notifications.create(aeConst.NOTIFY_BACKUP_REMIND_ID, {
        type: "basic",
        title: messenger.i18n.getMessage("backupNotifyTitle"),
        message: messenger.i18n.getMessage("backupNotifyMsg"),
        iconUrl: "img/icon.svg",
      });

      clearBackupNotificationInterval();
      setBackupNotificationInterval();

      await aePrefs.setPrefs({
        lastBackupRemDate: new Date().toString(),
      });
    }
  }
  else {
    clearBackupNotificationInterval();
    setBackupNotificationInterval();
  }
}   


function setBackupNotificationInterval()
{
  log("Clippings/mx: Setting backup notification interval (every 24 hours).");
  gBackupRemIntervalID = window.setInterval(showBackupNotification, aeConst.BACKUP_REMINDER_INTERVAL_MS);
}


function clearBackupNotificationInterval()
{
  if (gBackupRemIntervalID) {
    window.clearInterval(gBackupRemIntervalID);
    gBackupRemIntervalID = null;
  }
}


function showSyncHelperUpdateNotification()
{
  if (!gPrefs.syncClippings || !gPrefs.syncHelperCheckUpdates) {
    return;
  }

  let today, lastUpdateCheck, diff;
  if (gPrefs.lastSyncHelperUpdChkDate) {
    today = new Date();
    lastUpdateCheck = new Date(gPrefs.lastSyncHelperUpdChkDate);
    diff = new aeDateDiff(today, lastUpdateCheck);
  }

  if (!gPrefs.lastSyncHelperUpdChkDate || diff.days >= aeConst.SYNC_HELPER_CHECK_UPDATE_FREQ_DAYS) {
    let currVer = "";
    let msg = { msgID: "get-app-version" };
    let sendNativeMsg = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    sendNativeMsg.then(aResp => {
      currVer = aResp.appVersion;
      log("Clippings/mx: showSyncHelperUpdateNotification(): Current version of the Sync Clippings Helper app: " + currVer);
      return fetch(aeConst.SYNC_HELPER_CHECK_UPDATE_URL);

    }).then(aFetchResp => {
      if (aFetchResp.ok) {       
        return aFetchResp.json();
      }
      throw new Error("Unable to retrieve Sync Clippings Helper update info - network response was not ok");

    }).then(aUpdateInfo => {
      if (versionCompare(currVer, aUpdateInfo.latestVersion) < 0) {
        info(`Clippings/mx: showSyncHelperUpdateNotification(): Found a newer version of Sync Clippings Helper!  Current version: ${currVer}; new version found: ${aUpdateInfo.latestVersion}\nDisplaying user notification.`);
        
        gSyncClippingsHelperDwnldPgURL = aUpdateInfo.downloadPageURL;
        return messenger.notifications.create(aeConst.NOTIFY_SYNC_HELPER_UPDATE, {
          type: "basic",
          title: messenger.i18n.getMessage("syncUpdateTitle"),
          message: messenger.i18n.getMessage("syncUpdateMsg"),
          iconUrl: "img/syncClippingsApp.svg",
        });
      }
      else {
        return null;
      }

    }).then(aNotifID => {
      aePrefs.setPrefs({ lastSyncHelperUpdChkDate: new Date().toString() });
      
    }).catch(aErr => {
      console.error("Clippings/mx: showSyncHelperUpdateNotification(): Unable to check for updates to the Sync Clippings Helper app at this time.\n" + aErr);
    });
  }
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
    let width = 760;
    let height = 410;
    let topOffset = 200;
    let left, top;
    let wndGeom = gPrefs.clippingsMgrWndGeom;

    if (gPrefs.clippingsMgrSaveWndGeom && wndGeom) {
      width  = wndGeom.w - 1;  // Compensate for workaround to popup window bug.
      height = wndGeom.h;
      left   = wndGeom.x;
      top    = wndGeom.y;
    }
    else {
      if (gPrefs.autoAdjustWndPos) {
        ({left, top} = await aeWndPos.calcPopupWndCoords(width, height, topOffset, aeWndPos.WND_CURRENTLY_FOCUSED));
        wndGeom = true;
      }
      else {
        left = Math.ceil((window.screen.availWidth - width) / 2);
        top = Math.ceil((window.screen.availHeight - height) / 2);
      }
    }

    let wndInfo = {
      url: clippingsMgrURL,
      type: "popup",
      width, height,
      left, top,
    };

    let wnd = await messenger.windows.create(wndInfo);
    gWndIDs.clippingsMgr = wnd.id;

    // Workaround to bug where window position isn't set when calling
    // `browser.windows.create()`. If unable to get window geometry, then
    // default to centering on screen.
    if (wndGeom) {
      browser.windows.update(wnd.id, { left, top });
    }

    gClippingsMgrCleanUpIntvID = window.setInterval(async () => {
      log(`Clippings/mx: [Interval ID: ${gClippingsMgrCleanUpIntvID}]: Checking if Clippings Manager is open`);
      try {
        await messenger.windows.get(gWndIDs.clippingsMgr);
      }
      catch (e) {
        log("Clippings Manager window not found, cleaning up.");
        cleanUpClippingsMgr();
      }
    }, gPrefs.clippingsMgrCleanUpIntv);
  }
  // END nested helper function
  
  if (gWndIDs.clippingsMgr) {
    try {
      await messenger.windows.get(gWndIDs.clippingsMgr);
    }
    catch (e) {
      log("Clippings/mx: openClippingsManager(): Cleaning up dangling reference to previously-closed Clippings Manager window.");
      cleanUpClippingsMgr();
      openClippingsMgrHelper();
      return;
    }

    await messenger.runtime.sendMessage({ msgID: "focus-clippings-mgr-wnd" });
  }
  else {
    openClippingsMgrHelper();
  }
}


function cleanUpClippingsMgr()
{
  gWndIDs.clippingsMgr = null;
  window.clearInterval(gClippingsMgrCleanUpIntvID);
  gClippingsMgrCleanUpIntvID = null;

  purgeFolderItems(aeConst.DELETED_ITEMS_FLDR_ID).catch(aErr => {
    console.error("Clippings/mx: cleanUpClippingsMgr(): Error purging deleted clippings/folders: " + aErr);
  });
}


function openNewClippingDlg(aNewClippingContent)
{
  if (aNewClippingContent) {
    let name = createClippingNameFromText(aNewClippingContent);
    gNewClipping.set({ name, content: aNewClippingContent });
  }
  
  let url = messenger.runtime.getURL("pages/new.html");
  let height = 412;
  if (gOS == "win") {
    height = 444;
  }
  openDlgWnd(url, "newClipping", { type: "detached_panel", width: 432, height });
}


function openBackupDlg()
{
  let url = messenger.runtime.getURL("pages/backup.html");
  openDlgWnd(url, "backupFirstRun", { type: "detached_panel", width: 590, height: 410 });
}


function openMigrationStatusDlg()
{
  let url = messenger.runtime.getURL("pages/migrationStatus.html");
  openDlgWnd(url, "migrnStatus", { type: "detached_panel", width: 540, height: 180});
}


async function openDlgWnd(aURL, aWndKey, aWndPpty)
{
  async function openDlgWndHelper()
  {
    let width = aWndPpty.width;
    let height = aWndPpty.height;
    let left, top, wndGeom;

    if (gPrefs.autoAdjustWndPos) {
      ({ left, top } = await aeWndPos.calcPopupWndCoords(width, height, aWndPpty.topOffset, aeWndPos.WND_MSG_COMPOSE));
      wndGeom = true;
    }
    else {
      wndGeom = false;
      left = Math.ceil((window.screen.availWidth - width) / 2);
      top = Math.ceil((window.screen.availHeight - height) / 2);
    }

    let wnd = await messenger.windows.create({
      url: aURL,
      type: aWndPpty.type,
      width, height,
      left, top,
    });

    gWndIDs[aWndKey] = wnd.id;

    // Workaround to bug where window position isn't set when calling
    // `browser.windows.create()`. If unable to get window geometry, then
    // default to centering on screen.
    if (wndGeom) {
      browser.windows.update(wnd.id, { left, top });
    }
  }
  // END nested function

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

function getSyncClippingsListeners()
{
  return gSyncClippingsListeners;
}

// DEPRECATED
// - These functions are currently called from WindowListener scripts.
function getPrefs()
{
  return gPrefs;
}

async function setPrefs(aPrefs)
{
  await aePrefs.setPrefs(aPrefs);
}
// END DEPRECATED

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


function versionCompare(aVer1, aVer2)
{
  if (typeof aVer1 != "string" || typeof aVer2 != "string") {
    return false;
  }

  let v1 = aVer1.split(".");
  let v2 = aVer2.split(".");

  // Last digit may include pre-release suffix, e.g.: a1, b2, rc1
  let vs1 = v1[v1.length - 1].toString();
  let vs2 = v2[v2.length - 1].toString();

  const k = Math.min(v1.length, v2.length);
  
  for (let i = 0; i < k; ++ i) {
    v1[i] = parseInt(v1[i], 10);
    v2[i] = parseInt(v2[i], 10);
    
    if (v1[i] > v2[i]) {
      return 1;
    }
    if (v1[i] < v2[i]) {
      return -1;
    }
  }

  let s1Idx = vs1.search(/[a-z]/);
  let s2Idx = vs2.search(/[a-z]/);

  // E.g.: 6.0 <=> 6.0a1
  if (s1Idx == -1 && s2Idx > 0) {
    return 1;
  }
  // E.g.: 6.0rc1 <=> 6.0
  if (s1Idx > 0 && s2Idx == -1) {
    return -1;
  }
  // E.g.: 6.0b1 <=> 6.0b2
  if (s1Idx > 0 && s2Idx > 0) {
    let s1 = vs1.substr(s1Idx);
    let s2 = vs2.substr(s2Idx);

    if (s1 < s2) {
      return -1;
    }
    if (s1 > s2) {
      return 1;
    }
  }
  
  return (v1.length == v2.length ? 0: (v1.length < v2.length ? -1 : 1));
}



//
// Event handlers
//

messenger.runtime.onMessage.addListener(async (aRequest) => {
  log(`Clippings/mx: Received message "${aRequest.msgID}"`);

  let resp = null;

  switch (aRequest.msgID) {
  case "get-env-info":
    resp = {
      os: gOS,
      hostAppName: gHostAppName,
      hostAppVer:  gHostAppVer,
    };
    break;

  case "init-new-clipping-dlg":
    resp = gNewClipping.get();
    if (! resp) {
      resp = {};
    }
    resp.checkSpelling = gPrefs.checkSpelling;
    break;

  case "close-new-clipping-dlg":
    gWndIDs.newClipping = null;
    gIsDirty = true;
    break;

  case "get-shct-key-prefix-ui-str":
    resp = await getShortcutKeyPrefixStr();
    break;

  case "clear-backup-notifcn-intv":
    clearBackupNotificationInterval();
    resp = {};
    break;

  case "set-backup-notifcn-intv":
    setBackupNotificationInterval();
    break;

  case "backup-clippings":
    openClippingsManager(true);
    break;

  default:
    break;
  }

  if (resp) {
    return Promise.resolve(resp);
  }
});


messenger.NotifyTools.onNotifyBackground.addListener(async (aMessage) => {
  log(`Clipping/mx: Received NotifyTools message "${aMessage.command}" from legacy overlay script`);

  let rv = null;
  let isAsync = false;
  
  switch (aMessage.command) {
  case "get-prefs":
    rv = gPrefs;
    isAsync = true;
    break;

  case "set-prefs":
    rv = await aePrefs.setPrefs(aMessage.prefs);
    break;

  case "open-clippings-mgr":
    openClippingsManager(false);
    break;

  case "open-new-clipping-dlg":
    openNewClippingDlg(aMessage.clippingContent);
    break;

  case "get-clipping":
    rv = await getClipping(aMessage.clippingID);
    break;

  case "get-shct-key-map":
    rv = await getShortcutKeyMap();
    break;

  case "get-clipping-srch-data":
    rv = await getClippingSearchData();
    break;

  case "get-clippings-dirty-flag":
    rv = isDirty();
    isAsync = true;
    break;

  case "get-clippings-cxt-menu-data":
    rv = await getContextMenuData(aMessage.rootFldrID);
    isAsync = true;
    break;

  case "open-migrn-status-dlg":
    openMigrationStatusDlg();
    break;

  default:
    break;
  }

  if (isAsync) {
    return Promise.resolve(rv);
  }

  return rv;
});
  

messenger.storage.onChanged.addListener((aChanges, aAreaName) => {
  let changedPrefs = Object.keys(aChanges);

  for (let pref of changedPrefs) {
    gPrefs[pref] = aChanges[pref].newValue;
  }
});


messenger.notifications.onClicked.addListener(aNotifID => {
  if (aNotifID == aeConst.NOTIFY_BACKUP_REMIND_ID) {
    // Open Clippings Manager in backup mode.
    openClippingsManager(true);
  }
  else if (aNotifID == aeConst.NOTIFY_BACKUP_REMIND_FIRSTRUN_ID) {
    openBackupDlg();
  }
  else if (aNotifID == aeConst.NOTIFY_SYNC_HELPER_UPDATE) {
    messenger.tabs.create({ url: gSyncClippingsHelperDwnldPgURL });
  }
});


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
