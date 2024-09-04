/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const ROOT_FOLDER_NAME = "clippings-root";

let gOS;
let gHostAppName;
let gHostAppVer;
let gAutoIncrPlchldrs = null;
let gClippingMenuItemIDMap = {};
let gFolderMenuItemIDMap = {};
let gSyncFldrID = null;
let gBackupRemIntervalID = null;
let gIsReloadingSyncFldr = false;
let gSyncClippingsHelperDwnldPgURL;
let gForceShowFirstTimeBkupNotif = false;
let gClippingsMgrCleanUpIntvID = null;
let gIsSyncPushFailed = false;

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
        aePrefs.setPrefs({cxtMenuSyncItemsOnly: false});
      }
      if (aRebuildCxtMenu) {
        rebuildContextMenu();
      }
    }

    log("Clippings/mx: gSyncClippingsListener.onAfterDeactivate(): Remove Synced Clippings folder: " + aRemoveSyncFolder);

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
    log("Clippings/mx: gSyncClippingsListener.onReloadStart()");
    gIsReloadingSyncFldr = true;
  },
  
  async onReloadFinish()
  {
    log("Clippings/mx: gSyncClippingsListener.onReloadFinish(): Rebuilding Clippings menu");
    gIsReloadingSyncFldr = false;
    rebuildContextMenu();

    log("Clippings/mx: gSyncClippingsListeners.onReloadFinish(): Setting static IDs on synced items that don't already have them.");
    let isStaticIDsAdded = await addStaticIDs(gSyncFldrID);

    if (isStaticIDsAdded) {
      log("Clippings/mx: gSyncClippingsListener.onReloadFinish(): Static IDs added to synced items.  Saving sync file.");
      await pushSyncFolderUpdates();
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
    let rv = {name: this._name, content: this._content};
    return rv;
  },
  
  reset: function () {
    this._name = null;
    this._content = null;
  }
};

let gPastePrompt = {
  _composeTabs: [],

  add(aComposeTabID, aClippingContent)
  {
    this._composeTabs[aComposeTabID] = aClippingContent;
  },

  delete(aComposeTabID)
  {
    delete this._composeTabs[aComposeTabID];
  },

  get(aComposeTabID)
  {
    return this._composeTabs[aComposeTabID];
  }
};

let gPlaceholders = {
  _clippingName: null,
  _plchldrs: null,
  _clpCtnt: null,
  _plchldrsWithDefVals: null,

  set: function (aClippingName, aPlaceholders, aPlaceholdersWithDefaultVals, aClippingText) {
    this._clippingName = aClippingName;
    this._plchldrs = aPlaceholders;
    this._plchldrsWithDefVals = aPlaceholdersWithDefaultVals;
    this._clpCtnt = aClippingText;
  },

  get: function () {
    let rv = this.copy();
    this.reset();

    return rv;
  },

  copy: function () {
    let rv = {
      clippingName: this._clippingName,
      placeholders: this._plchldrs.slice(),
      placeholdersWithDefaultVals: Object.assign({}, this._plchldrsWithDefVals),
      content: this._clpCtnt
    };
    return rv;
  },

  reset: function () {
    this._clippingName = null;
    this._plchldrs = null;
    this._plchldrsWithDefVals = null;
    this._clpCtnt = null;
  }
};

let gWndIDs = {
  newClipping: null,
  clippingsMgr: null,
  pasteClippingOpts: null,
};

let gPrefs = null;
let gIsInitialized = false;
let gSetDisplayOrderOnRootItems = false;

// For the Clippings toolbar button context menu.
let gLastMenuInstID = 0;
let gNextMenuInstID = 1;


messenger.runtime.onInstalled.addListener(async (aInstall) => {
  if (aInstall.reason == "install") {
    info("Clippings/mx: MailExtension installed.");

    await setDefaultPrefs();
    await init();

    // Load the compose script and its dependencies into all message compose
    // windows that may be open at the time the extension is installed.
    let compTabs = await messenger.tabs.query({type: "messageCompose"});
    for (let tab of compTabs) {
      messenger.tabs.executeScript(tab.id, {
        file: messenger.runtime.getURL("lib/purify.min.js"),
      });
      messenger.tabs.executeScript(tab.id, {
        file: messenger.runtime.getURL("compose.js"),
      });
    }
  }
  else if (aInstall.reason == "update") {
    let oldVer = aInstall.previousVersion;
    let currVer = messenger.runtime.getManifest().version;
    log(`Clippings/mx: Upgrading from version ${oldVer} to ${currVer}`);

    gPrefs = await aePrefs.getAllPrefs();

    if (! aePrefs.hasSantaBarbaraPrefs(gPrefs)) {
      await setDefaultPrefs();
    }

    if (! aePrefs.hasCarpinteriaPrefs(gPrefs)) {
      log("Initializing 6.1 user preferences.");
      await aePrefs.setCarpinteriaPrefs(gPrefs);
    }

    if (! aePrefs.hasVenturaPrefs(gPrefs)) {
      log("Initializing 6.1.1 user preferences.");
      await aePrefs.setVenturaPrefs(gPrefs);
    }

    if (! aePrefs.hasCorralDeTierraPrefs(gPrefs)) {
      log("Initializing 6.2 user preferences.");
      await aePrefs.setCorralDeTierraPrefs(gPrefs);
    }

    if (! aePrefs.hasSanFranciscoPrefs(gPrefs)) {
      log("Initializing 7.0 user preferences.");
      await aePrefs.setSanFranciscoPrefs(gPrefs);

      let platform = await messenger.runtime.getPlatformInfo();
      if (platform.os == "linux") {
        aePrefs.setPrefs({clippingsMgrAutoShowStatusBar: true});
      }

      // Starting in Clippings 7.0, window positioning prefs are turned on
      // by default for macOS.
      // They were previously turned off due to a bug occurring on systems with
      // multiple displays in older versions of macOS.
      if (platform.os == "mac") {
        await aePrefs.setPrefs({
          autoAdjustWndPos: true,
          clippingsMgrSaveWndGeom: true,
        });
      }

      // Enable post-update notifications which users can click on to open the
      // What's New page.
      await aePrefs.setPrefs({
        upgradeNotifCount: aeConst.MAX_NUM_POST_UPGRADE_NOTIFICNS
      });
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


async function init()
{
  info("Clippings/mx: Initializing integration of MailExtension with host app...");

  let [msgr, platform] = await Promise.all([
    messenger.runtime.getBrowserInfo(),
    messenger.runtime.getPlatformInfo(),
  ]);
    
  gHostAppName = msgr.name;
  gHostAppVer = msgr.version;
  log(`Clippings/mx: Host app: ${gHostAppName} (version ${gHostAppVer})`);

  gOS = platform.os;
  log("Clippings/mx: OS: " + gOS);

  await aePrefs.migrateKeyboardPastePref(gPrefs, gOS);

  if (gPrefs.autoAdjustWndPos === null) {
    let autoAdjustWndPos = (gOS == "win" || gOS == "mac");
    let clippingsMgrSaveWndGeom = autoAdjustWndPos;
    await aePrefs.setPrefs({autoAdjustWndPos, clippingsMgrSaveWndGeom});
  }

  let extVer = messenger.runtime.getManifest().version;
  
  aeClippings.init();
  aeImportExport.setDatabase(aeClippings.getDB());

  aeImportExport.setL10nStrings({
    shctTitle: messenger.i18n.getMessage("expHTMLTitle"),
    hostAppInfo: messenger.i18n.getMessage("expHTMLHostAppInfo", [extVer, gHostAppName]),
    shctKeyInstrxns: messenger.i18n.getMessage("expHTMLShctKeyInstrxnTB"),
    shctKeyCustNote: "",
    shctKeyColHdr: messenger.i18n.getMessage("expHTMLShctKeyCol"),
    clippingNameColHdr: messenger.i18n.getMessage("expHTMLClipNameCol"),
  });
  
  if (gPrefs.syncClippings) {
    gSyncFldrID = gPrefs.syncFolderID;

    let isSyncReadOnly = await isSyncedClippingsReadOnly();
    log(`Clippings/mx: It is ${isSyncReadOnly} that the sync data is read only.`);

    // The context menu will be built when refreshing the sync data, via the
    // onReloadFinish event handler of the Sync Clippings listener.
    refreshSyncedClippings(true);
    aePrefs.setPrefs({isSyncReadOnly});
  }
  else {
    buildContextMenu();
  }
  
  aeClippingSubst.init(navigator.userAgent, gPrefs.autoIncrPlchldrStartVal);
  gAutoIncrPlchldrs = new Set();

  if (gPrefs.backupRemFirstRun && !gPrefs.lastBackupRemDate) {
    aePrefs.setPrefs({
      lastBackupRemDate: new Date().toString(),
    });
  }

  if (gPrefs.upgradeNotifCount > 0) {
    // Show post-upgrade notification in 1 minute.
    messenger.alarms.create("show-upgrade-notifcn", {
      delayInMinutes: aeConst.POST_UPGRADE_NOTIFCN_DELAY_MS / 60000
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
    await setDisplayOrderOnRootItems();
    log("Clippings/mx: Display order on root folder items have been set.");
  }

  let compScriptOpts = {
    js: [
      {file: "lib/purify.min.js"},
      {file: "compose.js"}
    ],
  };  
  messenger.composeScripts.register(compScriptOpts);

  initToolsMenuItem();

  gIsInitialized = true;
  log("Clippings/mx: MailExtension initialization complete.");    
}


async function setDisplayOrderOnRootItems()
{
  let clippingsDB = aeClippings.getDB();
  let seq = 1;

  clippingsDB.transaction("rw", clippingsDB.clippings, clippingsDB.folders, () => {
    clippingsDB.folders.where("parentFolderID").equals(aeConst.ROOT_FOLDER_ID).each((aItem, aCursor) => {
      log(`Clippings/mx: setDisplayOrderOnRootItems(): Folder "${aItem.name}" (id=${aItem.id}): display order = ${seq}`);
      let numUpd = clippingsDB.folders.update(aItem.id, {displayOrder: seq++});

    }).then(() => {
      return clippingsDB.clippings.where("parentFolderID").equals(aeConst.ROOT_FOLDER_ID).each((aItem, aCursor) => {
        log(`Clippings/mx: setDisplayOrderOnRootItems(): Clipping "${aItem.name}" (id=${aItem.id}): display order = ${seq}`);
        let numUpd = clippingsDB.clippings.update(aItem.id, {displayOrder: seq++});
      });

    }).then(() => {
      Promise.resolve();
    });     

  }).catch(aErr => {
    console.error("Clippings/mx: setDisplayOrderOnRootItems(): " + aErr);
    Promise.reject(aErr);
  });
}


function addStaticIDs(aFolderID)
{
  let rv = false;
  let clippingsDB = aeClippings.getDB();
  
  return new Promise((aFnResolve, aFnReject) => {
    clippingsDB.transaction("rw", clippingsDB.clippings, clippingsDB.folders, () => {
      clippingsDB.folders.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
        if (! ("sid" in aItem)) {
          let sid = aeUUID();
          clippingsDB.folders.update(aItem.id, {sid});
          log(`Clippings/mx: addStaticIDs(): Static ID added to folder ${aItem.id} - "${aItem.name}"`);
          rv = true;
        }
        addStaticIDs(aItem.id);
      }).then(() => {
        return clippingsDB.clippings.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
          if (! ("sid" in aItem)) {
            let sid = aeUUID();
            clippingsDB.clippings.update(aItem.id, {sid});
            log(`Clippings/mx: addStaticIDs(): Static ID added to clipping ${aItem.id} - "${aItem.name}"`);
            rv = true;
          }
        });
      }).then(() => {
        aFnResolve(rv);
      });
    }).catch(aErr => { aFnReject(aErr) });
  });
}


async function enableSyncClippings(aIsEnabled)
{
  let clippingsDB = aeClippings.getDB();

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
        gSyncFldrID = await clippingsDB.folders.add(syncFldr);
      }
      catch (e) {
        console.error("Clippings/mx: enableSyncClippings(): Failed to create the Synced Clipping folder: " + e);
      }

      await aePrefs.setPrefs({syncFolderID: gSyncFldrID});
      log("Clippings/mx: enableSyncClippings(): Synced Clippings folder ID: " + gSyncFldrID);
      return gSyncFldrID;
    }
  }
  else {
    log("Clippings/mx: enableSyncClippings(): Turning OFF");
    let oldSyncFldrID = gSyncFldrID;

    let numUpd = await clippingsDB.folders.update(gSyncFldrID, {isSync: undefined});
    await aePrefs.setPrefs({syncFolderID: null});
    gSyncFldrID = null;
    return oldSyncFldrID;
  }
}


async function isSyncedClippingsReadOnly()
{
  let rv = null;
  let perms = await messenger.permissions.getAll();
  if (! perms.permissions.includes("nativeMessaging")) {
    return rv;
  }
  
  let resp;
  try {
    resp = await messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, {
      msgID: "get-sync-file-info",
    });
  }
  catch (e) {
    console.error("Clippings/mx: isSyncedClippingsReadOnly(): Error sending native message to Sync Clippings Helper: " + e);
    return rv;
  }

  rv = !!resp.readOnly;

  return rv;
}


async function refreshSyncedClippings(aRebuildClippingsMenu)
{
  let perms = await messenger.permissions.getAll();
  if (! perms.permissions.includes("nativeMessaging")) {
    showNoNativeMsgPermNotification();
    return;
  }

  let resp;
  try {
    resp = await messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, {
      msgID: "get-app-version",
    });
  }
  catch (e) {
    console.error("Clippings/mx: refreshSyncedClippings(): Error sending native message to Sync Clippings Helper: " + e);
    if (e == aeConst.SYNC_ERROR_CONXN_FAILED
        || e == aeConst.SYNC_ERROR_NAT_APP_NOT_FOUND) {
      showSyncAppErrorNotification();
      return;
    }
  }
  log(`Clippings/mx: refreshSyncedClippings(): Sync Clippings Helper version: ${resp.appVersion}`);

  let isCompressedSyncData = false;
  let natMsg = {msgID: "get-synced-clippings"};
  if (aeVersionCmp(resp.appVersion, "2.0b1") >= 0 && gPrefs.compressSyncData) {
    isCompressedSyncData = true;
    natMsg.msgID = "get-compressed-synced-clippings";
  }
  
  log(`Clippings/mx: refreshSyncedClippings(): Retrieving synced clippings from Sync Clippings Helper by sending native message "${natMsg.msgID}"`);
  let syncJSONData = "";
  resp = await messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, natMsg); 

  if (resp) {
    if (isCompressedSyncData) {
      log("Clippings/mx: refreshSyncedClippings(): Received Sync Clippings Helper 2.0 response (base64-encoded gzip format)");
      if (resp.status == "ok") {
        let zipData = aeCompress.base64ToBytes(resp.data);
        syncJSONData = await aeCompress.decompress(zipData);
      }
      else {
        console.error("Sync Clippings Helper is unable to read the sync file.  Error details:\n" + resp.details);
        showSyncReadErrorNotification();
        return;
      }
    }
    else {
      log("Clippings/mx: refreshSyncedClippings(): Received Sync Clippings Helper 1.x response");
      syncJSONData = resp;
    }
  }
  else {
    throw new Error("Clippings/mx: refreshSyncedClippings(): Response data from native app is invalid");
  }

  let clippingsDB = aeClippings.getDB();

  if (gSyncFldrID === null) {
    log("Clippings/mx: The Synced Clippings folder is missing. Creating it...");
    let syncFldr = {
      name: messenger.i18n.getMessage("syncFldrName"),
      parentFolderID: aeConst.ROOT_FOLDER_ID,
      displayOrder: 0,
    };
    
    gSyncFldrID = await clippingsDB.folders.add(syncFldr);
  }

  log("Clippings/mx: refreshSyncedClippings(): Synced Clippings folder ID: " + gSyncFldrID);
  await aePrefs.setPrefs({syncFolderID: gSyncFldrID});

  gSyncClippingsListener.onReloadStart();

  log("Clippings/mx: Purging existing items in the Synced Clippings folder...");
  await purgeFolderItems(gSyncFldrID, true);

  log("Clippings/mx: Importing clippings data from sync file...");

  // Method aeImportExport.importFromJSON() is asynchronous, so the import
  // may not yet be finished when this function has finished executing!
  aeImportExport.setDatabase(clippingsDB);
  aeImportExport.importFromJSON(syncJSONData, false, false, gSyncFldrID);

  window.setTimeout(function () {
    gSyncClippingsListener.onReloadFinish();
  }, gPrefs.afterSyncFldrReloadDelay);
}


async function pushSyncFolderUpdates()
{
  if (!gPrefs.syncClippings || gSyncFldrID === null) {
    throw new Error("Sync Clippings is not turned on!");
  }
  
  let perms = await messenger.permissions.getAll();
  if (! perms.permissions.includes("nativeMessaging")) {
    return;
  }

  let syncData = await aeImportExport.exportToJSON(true, true, gSyncFldrID, false, true, true);
  let natMsg = {
    msgID: "set-synced-clippings",
    syncData: syncData.userClippingsRoot,
  };

  info("Clippings/mx: pushSyncFolderUpdates(): Pushing Synced Clippings folder updates to the Sync Clippings helper app. Message data:");
  log(natMsg);

  let resp;
  try {
    resp = await messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, natMsg);
  }
  catch (e) {
    console.error("Clippings/mx: pushSyncFolderUpdates(): " + e);
    throw e;
  }

  log("Clippings/mx: pushSyncFolderUpdates(): Response from native app:");
  log(resp);

  if (resp.status == "error") {
    // An error may occur if the push failed because the sync file is
    // read only.
    if (resp.details.search(/TypeError/) != -1 && !gIsSyncPushFailed) {
      showSyncPushReadOnlyNotification();
      gIsSyncPushFailed = true;
    }

  }
}


async function purgeFolderItems(aFolderID, aKeepFolder)
{
  let clippingsDB = aeClippings.getDB();

  clippingsDB.transaction("rw", clippingsDB.clippings, clippingsDB.folders, () => {
    clippingsDB.folders.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
      purgeFolderItems(aItem.id, false).then(() => {});

    }).then(() => {
      if (!aKeepFolder && aFolderID != aeConst.DELETED_ITEMS_FLDR_ID) {
        log("Clippings/mx: purgeFolderItems(): Deleting folder: " + aFolderID);
        return clippingsDB.folders.delete(aFolderID);
      }
      return null;
      
    }).then(() => {
      return clippingsDB.clippings.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
        log("Clippings/mx: purgeFolderItems(): Deleting clipping: " + aItem.id);
        clippingsDB.clippings.delete(aItem.id);
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
  let platform = await messenger.runtime.getPlatformInfo();
  let isMacOS = platform.os == "mac";
  let [cmd] = await messenger.commands.getAll();
  let shct = cmd.shortcut;

  if (! shct) {
    // Keyboard shortcut may not be defined if user removed it but didn't set a
    // new shortcut in Manage Extension Shortcuts.
    return rv;
  }
  
  let keybPasteKey = shct.substring(shct.lastIndexOf("+") + 1);
  let keybPasteMods = shct.substring(0, shct.lastIndexOf("+"));

  let keys = [
    "Home", "End", "PageUp", "PageDown", "Space", "Insert", "Delete",
    "Up", "Down", "Left", "Right"
  ];
  let localizedKey = "";

  if (keys.includes(keybPasteKey)) {
    if (keybPasteKey == "Delete" && isMacOS) {
      localizedKey = messenger.i18n.getMessage("keyMacDel");
    }
    else {
      localizedKey = messenger.i18n.getMessage(`key${keybPasteKey}`);
    }
  }
  else {
    if (keybPasteKey == "Period") {
      localizedKey = ".";
    }
    else if (keybPasteKey == "Comma") {
      localizedKey = ",";
    }
    else {
      localizedKey = keybPasteKey;
    }
  }

  let modifiers = keybPasteMods.split("+");

  // On macOS, always put the primary modifier key (e.g. Command) at the end.
  if (isMacOS && modifiers.length > 1 && modifiers[1] == "Shift") {
    let modPrimary = modifiers.shift();
    modifiers.push(modPrimary);
  }
  
  let localizedMods = "";

  for (let i = 0; i < modifiers.length; i++) {
    let modifier = modifiers[i];
    let localzMod;
    
    if (isMacOS) {
      if (modifier == "Alt") {
        localzMod = messenger.i18n.getMessage("keyOption");
      }
      else if (modifier == "Ctrl") {
        localzMod = messenger.i18n.getMessage("keyCommand");
      }
      else if (modifier == "Shift") {
        localzMod = messenger.i18n.getMessage("keyMacShift");
      }
      else {
        localzMod = messenger.i18n.getMessage(`key${modifier}`);
      }
    }
    else {
      localzMod = messenger.i18n.getMessage(`key${modifier}`);
      localzMod += "+";
    }
    localizedMods += localzMod;
  }

  rv = `${localizedMods}${localizedKey}`;
  return rv;
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
  // END nested functions

  let rv = [];
  let clippingsDB = aeClippings.getDB();

  return new Promise((aFnResolve, aFnReject) => {
    clippingsDB.transaction("r", clippingsDB.folders, clippingsDB.clippings, () => {
      clippingsDB.folders.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
        let fldrMenuItemID = "ae-clippings-folder-" + aItem.id + "_" + Date.now();
        gFolderMenuItemIDMap[aItem.id] = fldrMenuItemID;

        let submenuItemData = {
          id: fldrMenuItemID,
          title: sanitizeMenuTitle(aItem.name),
        };

        // Submenu icon
        let iconPath = "img/folder.svg";
        if (aItem.id == gSyncFldrID) {
          // Firefox bug on macOS:
          // Dark Mode setting isn't applied to the browser context menu when
          // a Firefox dark color theme is used.
          if (getContextMenuData.isDarkMode) {
            if (gPrefs.isSyncReadOnly) {
              iconPath = "img/synced-clippings-readonly-dk.svg";
            }
            else {
              iconPath = "img/synced-clippings-dk.svg";
            }
          }
          else {
            if (gPrefs.isSyncReadOnly) {
              iconPath = "img/synced-clippings-readonly.svg";
            }
            else {
              iconPath = "img/synced-clippings.svg";
            }
          }
          submenuItemData.isSync = true;
        }

        submenuItemData.icons = {16: iconPath};

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
        return clippingsDB.clippings.where("parentFolderID").equals(aFolderID).each((aItem, aCursor) => {
          let menuItemData;
          if (aItem.separator) {
            menuItemData = {separator: true};

            if ("displayOrder" in aItem) {
              menuItemData.displayOrder = aItem.displayOrder;
            }
            else {
              menuItemData.displayOrder = 0;
            }           
          }
          else {
            let menuItemID = "ae-clippings-clipping-" + aItem.id + "_" + Date.now();
            gClippingMenuItemIDMap[aItem.id] = menuItemID;

            menuItemData = {
              id: menuItemID,
              title: sanitizeMenuTitle(aItem.name),
              icons: {
                16: "img/" + (aItem.label ? `clipping-${aItem.label}.svg` : "clipping.svg")
              },
            };

            if (aItem.label) {
              menuItemData.label = aItem.label;
            }

            if ("shortcutKey" in aItem && aItem.shortcutKey != "" && gPrefs.showShctKey) {
              let shctKey = "";
              if (gPrefs.showShctKeyDispStyle == aeConst.SHCTKEY_DISPLAY_SQ_BRKT) {
                shctKey = ` [${aItem.shortcutKey}]`;
              }
              else {
                shctKey = ` (${aItem.shortcutKey})`;
              }
              menuItemData.title += shctKey;
            }

            if ("displayOrder" in aItem) {
              menuItemData.displayOrder = aItem.displayOrder;
            }
            else {
              menuItemData.displayOrder = 0;
            }
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
getContextMenuData.isDarkMode = null;


function sanitizeMenuTitle(aTitle)
{
  // Escape the ampersand character, which would normally be used to denote
  // the access key for the menu item.
  let rv = aTitle.replace(/&/g, "&&");

  return rv;
}


function updateContextMenuForFolder(aUpdatedFolderID)
{
  log("Clippings/mx: updateContextMenuForFolder(): Updating folder " + aUpdatedFolderID);
  let id = Number(aUpdatedFolderID);
  let clippingsDB = aeClippings.getDB();

  clippingsDB.folders.get(id).then(aResult => {
    let menuItemID = gFolderMenuItemIDMap[id];
    if (menuItemID) {
      let title = sanitizeMenuTitle(aResult.name);
      messenger.menus.update(menuItemID, {title});
    }
  });
}


async function buildContextMenu()
{
  log("Clippings/mx: buildContextMenu()");

  // Context menu for compose action button.
  messenger.menus.create({
    id: "ae-clippings-reset-autoincr-plchldrs",
    title: messenger.i18n.getMessage("baMenuResetAutoIncrPlaceholders"),
    enabled: false,
    contexts: ["compose_action"],
  });

  let prefsMnuStrKey = "mnuPrefs";
  if (gOS == "win") {
    prefsMnuStrKey = "mnuPrefsWin";
  }
  messenger.menus.create({
    id: "ae-clippings-prefs",
    title: messenger.i18n.getMessage(prefsMnuStrKey),
    contexts: ["compose_action"],
  });
  messenger.menus.create({
    id: "ae-clippings-show-paste-opts",
    title: messenger.i18n.getMessage("cxtMenuShowPasteOpts"),
    type: "checkbox",
    checked: false,
    contexts: ["compose_action"],
  });

  // Context menu for composer.
  messenger.menus.create({
    id: "ae-clippings-new",
    title: messenger.i18n.getMessage("cxtMenuNew"),
    contexts: ["compose_body"],
  });
  messenger.menus.create({
    id: "ae-clippings-manager",
    title: messenger.i18n.getMessage("cxtMenuOpenClippingsMgr"),
    contexts: ["compose_body"],
  });

  let rootFldrID = aeConst.ROOT_FOLDER_ID;
  if (gPrefs.syncClippings && gPrefs.cxtMenuSyncItemsOnly) {
    rootFldrID = gSyncFldrID;
  }

  let menuData;
  try {
    menuData = await getContextMenuData(rootFldrID);
  }
  catch (e) {
    onError(e);
  }

  if (aeConst.DEBUG) {
    console.log("buildContextMenu(): Menu data: ");
    console.log(menuData);
  }
    
  if (menuData.length > 0) {
    messenger.menus.create({
      type: "separator",
      contexts: ["compose_body"],
    });

    buildContextMenuHelper(menuData);
  }
}


function buildContextMenuHelper(aMenuData)
{
  for (let i = 0; i < aMenuData.length; i++) {
    let menuData = aMenuData[i];
    let menuItem;

    if (menuData.separator) {
      menuItem = {
        type: "separator",
        contexts: ["compose_body"],
      };
    }
    else {
      menuItem = {
        id: menuData.id,
        title: menuData.title,
        icons: menuData.icons,
        contexts: ["compose_body"],
      };
    }

    if ("parentId" in menuData && menuData.parentId != aeConst.ROOT_FOLDER_ID) {
      menuItem.parentId = menuData.parentId;
    }

    messenger.menus.create(menuItem);
    
    if (menuData.submenuItems) {
      buildContextMenuHelper(menuData.submenuItems);
    }
  }
}


async function rebuildContextMenu()
{
  log("Clippings/mx: rebuildContextMenu(): Removing all Clippings context menu items and rebuilding the menu...");
  await messenger.menus.removeAll();

  gClippingMenuItemIDMap = {};
  gFolderMenuItemIDMap = {};
  initToolsMenuItem();
  await buildContextMenu();
}


function initToolsMenuItem()
{
  if (gPrefs.showToolsCmd) {
    messenger.menus.create({
      id: "ae-tools-clippings-mgr",
      title: messenger.i18n.getMessage("cxtMenuOpenClippingsMgr"),
      contexts: ["tools_menu"],
    });
  }
  else {
    try {
      messenger.menus.remove("ae-tools-clippings-mgr");
    }
    catch {}
  }
}


function buildAutoIncrementPlchldrResetMenu(aAutoIncrPlchldrs)
{
  let enabledResetMenu = false;
  
  aAutoIncrPlchldrs.forEach(async (aItem, aIndex, aArray) => {
    if (! gAutoIncrPlchldrs.has(aItem)) {
      gAutoIncrPlchldrs.add(aItem);

      let menuItem = {
        id: `ae-clippings-reset-autoincr-${aItem}`,
        title: `#[${aItem}]`,
        parentId: "ae-clippings-reset-autoincr-plchldrs",
        contexts: ["compose_action"],
      };
      
      await messenger.menus.create(menuItem);
      if (! enabledResetMenu) {
        await messenger.menus.update("ae-clippings-reset-autoincr-plchldrs", {
          enabled: true
        });
        enabledResetMenu = true;
      }
    }
  });
}


async function resetAutoIncrPlaceholder(aPlaceholder)
{
  log(`Clippings/mx: resetAutoIncrPlaceholder(): Resetting placeholder: #[${aPlaceholder}]`);

  aeClippingSubst.resetAutoIncrementVar(aPlaceholder);
  gAutoIncrPlchldrs.delete(aPlaceholder);
  await messenger.menus.remove(`ae-clippings-reset-autoincr-${aPlaceholder}`);
  
  if (gAutoIncrPlchldrs.size == 0) {
    messenger.menus.update("ae-clippings-reset-autoincr-plchldrs", {enabled: false});
  }
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

      await messenger.notifications.create("backup-reminder-firstrun", {
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

      if (gPrefs.skipBackupRemIfUnchg && gPrefs.clippingsUnchanged) {
        log("Clippings/mx: No changes to clippings since last backup; skipping backup notification.");
      }
      else {
        await messenger.notifications.create("backup-reminder", {
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


async function showWhatsNewNotification()
{
  let extName = messenger.i18n.getMessage("extNameTB");
  await messenger.notifications.create("whats-new", {
    type: "basic",
    title: extName,
    message: messenger.i18n.getMessage("upgradeNotifcn", extName),
    iconUrl: "img/icon.svg",
  });

  let upgradeNotifCount = gPrefs.upgradeNotifCount - 1;
  aePrefs.setPrefs({upgradeNotifCount});
}


async function showSyncHelperUpdateNotification()
{
  if (!gPrefs.syncClippings || !gPrefs.syncHelperCheckUpdates) {
    return;
  }

  // Don't bother proceeding if the native messaging optional permission
  // wasn't granted.
  let perms = await messenger.permissions.getAll();
  if (! perms.permissions.includes("nativeMessaging")) {
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
    let natMsg = {msgID: "get-app-version"};
    let resp;
    try {
      resp = await messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, natMsg);
    }
    catch (e) {
      console.error("Clippings/mx: showSyncHelperUpdateNotification(): Unable to connect to Sync Clippings Helper App\n" + e);
      return;
    }

    currVer = resp.appVersion;
    log("Clippings/mx: showSyncHelperUpdateNotification(): Current version of the Sync Clippings Helper app: " + currVer);

    let fetchResp;
    try {
      fetchResp = await fetch(aeConst.SYNC_HELPER_CHECK_UPDATE_URL);
    }
    catch (e) {
      console.error("Clippings/mx: showSyncHelperUpdateNotification(): Unable to check for updates to the Sync Clippings Helper app at this time.\n" + e);
      return;
    }
    
    if (! fetchResp.ok) {
      console.error(`Clippings/mx: showSyncHelperUpdateNotification(): HTTP status ${fetchResp.status} (${fetchResp.statusText}) received from URL ${fetchResp.url}`);
      return;
    }
    
    let updateInfo = await fetchResp.json();

    if (aeVersionCmp(currVer, updateInfo.latestVersion) < 0) {
      info(`Clippings/mx: showSyncHelperUpdateNotification(): Found a newer version of Sync Clippings Helper!  Current version: ${currVer}; new version found: ${updateInfo.latestVersion}\nDisplaying user notification.`);
      
      gSyncClippingsHelperDwnldPgURL = updateInfo.downloadPageURL;
      messenger.notifications.create("sync-helper-update", {
        type: "basic",
        title: messenger.i18n.getMessage("syncUpdateTitle"),
        message: messenger.i18n.getMessage("syncUpdateMsg"),
        iconUrl: "img/syncClippingsApp.svg",
      });

      aePrefs.setPrefs({
        lastSyncHelperUpdChkDate: new Date().toString()
      });
    }
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


function getClippingsBackupData()
{
  let excludeSyncFldrID = null;
  if (gPrefs.syncClippings) {
    excludeSyncFldrID = gPrefs.syncFolderID;
  }

  return aeImportExport.exportToJSON(false, false, aeConst.ROOT_FOLDER_ID, excludeSyncFldrID, true, true);
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
      messenger.windows.update(wnd.id, {left, top});
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


function newClipping(aComposeTab)
{
  let injectOpts = {code: `getSelectedText()`};
  messenger.tabs.executeScript(aComposeTab.id, injectOpts);
}


function openNewClippingDlg(aNewClippingContent)
{
  if (aNewClippingContent) {
    let name = createClippingNameFromText(aNewClippingContent);
    gNewClipping.set({name, content: aNewClippingContent});
  }
  
  let url = messenger.runtime.getURL("pages/new.html");
  let height = 410;
  if (gOS == "win") {
    height = 434;
  }
  openDlgWnd(url, "newClipping", {type: "popup", width: 432, height});
}


function openKeyboardPasteDlg(aComposeTabID)
{
  let url = messenger.runtime.getURL("pages/keyboardPaste.html?compTabID=" + aComposeTabID);
  openDlgWnd(url, "keyboardPaste", {
    type: "popup",
    width: 500,
    height: 164,
    topOffset: 256,
  });
}


function openPlaceholderPromptDlg(aComposeTabID)
{
  let url = messenger.runtime.getURL("pages/placeholderPrompt.html?compTabID=" + aComposeTabID);
  openDlgWnd(url, "placeholderPrmt", {
    type: "popup",
    width: 536,
    height: 228,
    topOffset: 256,
  });
}


async function openBackupDlg()
{
  let url = messenger.runtime.getURL("pages/backup.html");
  let lang = messenger.i18n.getUILanguage();
  let wndKey = "backupFirstRun";
  let height = 412;
  
  if (lang == "uk" || (lang == "fr" && gOS == "mac")) {
    height = 450;
  }

  let wndPpty = {
    url,
    type: "popup",
    width: 590, height,
    top: 64, left: 128,
  };

  // The (x,y) coords set above will be ignored - the popup window will always
  // be centered on the primary display, where the first-time backup
  // notification is assumed to appear.
  let wnd = await messenger.windows.create(wndPpty);

  gWndIDs[wndKey] = wnd.id;
}


function openShortcutListWnd()
{
  let url = messenger.runtime.getURL("pages/shortcutList.html");
  let width = 436;
  let height = 272;
  if (gOS == "win") {
    height = 286;
  }
  
  openDlgWnd(url, "shctList", {type: "popup", width, height, topOffset: 256});
}


async function openDlgWnd(aURL, aWndKey, aWndPpty, aWndType)
{
  if (typeof aWndType != "number") {
    aWndType = aeWndPos.WND_MSG_COMPOSE;
  }
  
  async function openDlgWndHelper()
  {
    let width = aWndPpty.width;
    let height = aWndPpty.height;
    let left, top, wndGeom;

    if (gPrefs.autoAdjustWndPos) {
      ({ left, top } = await aeWndPos.calcPopupWndCoords(width, height, aWndPpty.topOffset, aWndType));
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
      messenger.windows.update(wnd.id, { left, top });
    }
  }
  // END nested function

  if (gWndIDs[aWndKey]) {
    try {
      await messenger.windows.get(gWndIDs[aWndKey]);
      messenger.windows.update(gWndIDs[aWndKey], {focused: true});
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


async function getWndGeometryFromComposeTab()
{
  let rv = null;

  let [tab] = await messenger.tabs.query({active: true, currentWindow: true});
  if (!tab || tab.type != "messageCompose") {
    // This could happen if the compose window was closed while the
    // placeholder prompt dialog was open.
    return rv;
  }

  let wnd = await messenger.windows.get(tab.windowId);
  let wndGeom = {
    w: tab.width,
    h: tab.height,
    x: wnd.left,
    y: wnd.top,
  };
  rv = wndGeom;

  return rv;
}


async function toggleShowPastePrompt(aComposeTabID)
{
  let showPastePrompt = await messenger.tabs.sendMessage(aComposeTabID, {
    id: "get-paste-prompt-pref",
  });

  messenger.tabs.sendMessage(aComposeTabID, {
    id: "set-paste-prompt-pref",
    showPastePrompt: !showPastePrompt,
  });
}


function pasteClippingByID(aClippingID, aComposeTabID)
{
  let clippingsDB = aeClippings.getDB();
  
  clippingsDB.transaction("r", clippingsDB.clippings, clippingsDB.folders, () => {
    let clipping = null;
    
    clippingsDB.clippings.get(aClippingID).then(aClipping => {
      if (! aClipping) {
        throw new Error("Cannot find clipping with ID = " + aClippingID);
      }

      if (aClipping.parentFolderID == -1) {
        throw new Error("Attempting to paste a deleted clipping!");
      }

      clipping = aClipping;
      log(`Pasting clipping named "${clipping.name}"\nid = ${clipping.id}`);
        
      return clippingsDB.folders.get(aClipping.parentFolderID);
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

      pasteClipping(clippingInfo, aComposeTabID);
    });
  }).catch(aErr => {
    console.error("Clippings/wx: pasteClippingByID(): " + aErr);
  });
}


function pasteClippingByShortcutKey(aShortcutKey, aComposeTabID)
{
  let clippingsDB = aeClippings.getDB();

  clippingsDB.transaction("r", clippingsDB.clippings, clippingsDB.folders, () => {
    let results = clippingsDB.clippings.where("shortcutKey").equals(aShortcutKey.toUpperCase());
    let clipping = {};
    
    results.first().then(aClipping => {
      if (! aClipping) {
        log(`Cannot find clipping with shortcut key '${aShortcutKey}'`);
        return null;
      }

      if (aClipping.parentFolderID == -1) {
        throw new Error(`Shortcut key '${aShortcutKey}' is assigned to a deleted clipping!`);
      }

      clipping = aClipping;
      log(`Pasting clipping named "${clipping.name}"\nid = ${clipping.id}`);

      return clippingsDB.folders.get(aClipping.parentFolderID);
    }).then(aFolder => {
      if (aFolder === null) {
        return;
      }

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

      pasteClipping(clippingInfo, aComposeTabID);
    });
  }).catch(aErr => {
    console.error("Clippings/mx: pasteClippingByShortcutKey(): " + aErr);
  });
}


async function pasteClipping(aClippingInfo, aComposeTabID)
{
  let processedCtnt = "";

  if (aeClippingSubst.hasNoSubstFlag(aClippingInfo.name)) {
    processedCtnt = aClippingInfo.text;
  }
  else {
    processedCtnt = await aeClippingSubst.processStdPlaceholders(aClippingInfo);
    let failedPlchldrs = aeClippingSubst.getFailedPlaceholders();
    if (failedPlchldrs.length > 0) {
      // TO DO: Show dialog giving the user the option to edit the clipping in
      // Clippings Manager, paste anyway, or cancel.
      warn(`Clipping: ${aClippingInfo.name}\nOne or more placeholders could not be filled in.`);
      log(failedPlchldrs.toString());
    }

    let autoIncrPlchldrs = aeClippingSubst.getAutoIncrPlaceholders(processedCtnt);
    if (autoIncrPlchldrs.length > 0) {
      buildAutoIncrementPlchldrResetMenu(autoIncrPlchldrs);
      processedCtnt = aeClippingSubst.processAutoIncrPlaceholders(processedCtnt);
    }

    let plchldrs = aeClippingSubst.getCustomPlaceholders(processedCtnt);
    if (plchldrs.length > 0) {
      let plchldrsWithDefaultVals = aeClippingSubst.getCustomPlaceholderDefaultVals(processedCtnt, aClippingInfo);
      gPlaceholders.set(aClippingInfo.name, plchldrs, plchldrsWithDefaultVals, processedCtnt);

      openPlaceholderPromptDlg(aComposeTabID);
      return;
    }
  }

  // Check if user wants to be prompted to format the clipping as normal or
  // quoted text.
  let isPasteOptsDlgShown = await showPasteOptionsDlg(aComposeTabID, processedCtnt);
  if (isPasteOptsDlgShown) {
    // Control returns to function pasteProcessedClipping() when user clicks OK
    // in the paste options dialog.
    return;
  }
  
  pasteProcessedClipping(processedCtnt, aComposeTabID);
}


async function showPasteOptionsDlg(aComposeTabID, aClippingContent)
{
  let rv = false;

  let showPastePrompt = await messenger.tabs.sendMessage(aComposeTabID, {
    id: "get-paste-prompt-pref",
  });

  if (showPastePrompt) {
    if (gWndIDs.pasteClippingOpts) {
      // If the paste clipping options dialog is open, it's likely that the
      // user has forgotten or abandoned their previous clipping, so close it.
      // Note that the window ID may be invalid because the user closed the
      // dialog by clicking the 'X' button on the title bar instead of
      // clicking Cancel.
      let wnd;
      try {
        wnd = await messenger.windows.get(gWndIDs.pasteClippingOpts);
      }
      catch {}
      if (wnd) {
        messenger.windows.remove(wnd.id);
      }
      gWndIDs.pasteClippingOpts = null;
    }

    gPastePrompt.add(aComposeTabID, aClippingContent);
    let url = messenger.runtime.getURL("pages/pasteOptions.html?compTabID=" + aComposeTabID);
    let height = 210;
    if (gOS == "mac") {
      height = 200;
    }

    await openDlgWnd(url, "pasteClippingOpts", {type: "popup", width: 256, height});
    rv = true;
  }

  return rv;
}


async function pasteProcessedClipping(aClippingContent, aComposeTabID, aPasteAsQuoted=false)
{
  // Perform a final check to confirm that the composer represented by
  // aComposeTabID is still open.
  try {
    await messenger.tabs.get(aComposeTabID);
  }
  catch {
    warn("Clippings/mx: pasteProcessedClipping(): Can't find compose tab " + aComposeTabID);
    return;
  }

  let comp = await messenger.compose.getComposeDetails(aComposeTabID);

  await messenger.tabs.sendMessage(aComposeTabID, {
    id: "paste-clipping",
    content: aClippingContent,
    isPlainText: comp.isPlainText,
    htmlPaste: gPrefs.htmlPaste,
    autoLineBreak: gPrefs.autoLineBreak,
    pasteAsQuoted: aPasteAsQuoted,
  });
}


function showSyncAppErrorNotification()
{
  messenger.notifications.create("sync-app-error", {
    type: "basic",
    title: messenger.i18n.getMessage("syncStartupFailedHdg"),
    message: messenger.i18n.getMessage("syncStartupFailed"),
    iconUrl: "img/error.svg",
  });
}


function showSyncReadErrorNotification()
{
  messenger.notifications.create("sync-read-error", {
    type: "basic",
    title: messenger.i18n.getMessage("syncStartupFailedHdg"),
    message: messenger.i18n.getMessage("syncGetFailed"),
    iconUrl: "img/error.svg",
  });
}


function showSyncPushReadOnlyNotification()
{
  messenger.notifications.create("sync-push-read-only-error", {
    type: "basic",
    title: messenger.i18n.getMessage("syncStartupFailedHdg"),
    message: messenger.i18n.getMessage("syncFldrRdOnly"),
    iconUrl: "img/error.svg",
  });
}


function showNoNativeMsgPermNotification()
{
  messenger.notifications.create("native-msg-perm-error", {
    type: "basic",
    title: messenger.i18n.getMessage("syncStartupFailedHdg"),
    message: messenger.i18n.getMessage("syncPermNotif"),
    iconUrl: "img/error.svg",
  });
}


async function openOptionsPage()
{
  let resp;
  try {
    resp = await messenger.runtime.sendMessage({msgID: "ping-ext-prefs-pg"});
  }
  catch {}

  if (resp) {
    await messenger.runtime.sendMessage({msgID: "focus-ext-prefs-pg"});
  }
  else {
    messenger.runtime.openOptionsPage();
  }
}


//
// Utility functions
//

async function alertEx(aMessageName, aUsePopupWnd=false)
{
  let message = messenger.i18n.getMessage(aMessageName);
  info("Clippings/mx: " + message);

  let url = "pages/msgbox.html?msgid=" + aMessageName;

  // Center the common message box popup within originating composer window,
  // both horizontally and vertically.
  let wndGeom = null;
  let width = 520;
  let height = 170;

  // Default popup window coords.  Unless replaced by window geometry calcs,
  // these coords will be ignored - popup window will always be centered
  // on screen due to a WebExtension API bug; see next comment.
  let left = 256;
  let top = 64;

  if (gPrefs && gPrefs.autoAdjustWndPos) {
    wndGeom = await getWndGeometryFromComposeTab();

    if (wndGeom) {
      if (wndGeom.w < width) {
        left = null;
      }
      else {
        left = Math.ceil((wndGeom.w - width) / 2) + wndGeom.x;
      }

      if ((wndGeom.h) < height) {
        top = null;
      }
      else {
        top = Math.ceil((wndGeom.h - height) / 2) + wndGeom.y;
      }
    }
  }

  let wndKey = "ae_clippings_msgbox";
  let wnd = await messenger.windows.create({
    url,
    type: "popup",
    width, height,
    left, top,
  });

  gWndIDs[wndKey] = wnd.id;

  // Workaround to bug where window position isn't correctly set when calling
  // `browser.windows.create()`. If unable to get window geometry, then default
  // to centering on screen.
  if (wndGeom) {
    messenger.windows.update(wnd.id, {left, top});
  }
}


//
// Event handlers
//

messenger.composeAction.onClicked.addListener(aTab => {
  openClippingsManager(false);
});


messenger.commands.onCommand.addListener(async (aCmdName, aTab) => {
  info(`Clippings/mx: Command "${aCmdName}" invoked!`);

  // Ignore command if not invoked from the message composer.
  if (aTab.type != "messageCompose") {
    log(`Clippings/mx: Command invoked from tab ${aTab.id}, which isn't a messageCompose tab.`);
    return;
  }

  if (aCmdName == "ae-clippings-paste-clipping") {
    gPrefs.keybdPaste && openKeyboardPasteDlg(aTab.id);
  }
});


messenger.menus.onShown.addListener(async (aInfo, aTab) => {
  if (aTab.type != "messageCompose" || !aInfo.contexts.includes("compose_action")) {
    return;
  }

  let menuInstID = gNextMenuInstID++;
  gLastMenuInstID = menuInstID;

  let showPastePrmpt = await messenger.tabs.sendMessage(aTab.id, {id: "get-paste-prompt-pref"});

  // Check if the menu is still shown when the above async call finished.
  if (menuInstID != gLastMenuInstID) {
    return;
  }

  messenger.menus.update("ae-clippings-show-paste-opts", {
    checked: showPastePrmpt,
  });
  messenger.menus.refresh();
});


messenger.menus.onHidden.addListener(() => {
  gLastMenuInstID = 0;
});


messenger.menus.onClicked.addListener((aInfo, aTab) => {
  switch (aInfo.menuItemId) {
  case "ae-clippings-new":
    newClipping(aTab);
    break;

  case "ae-clippings-manager":
  case "ae-tools-clippings-mgr":
    openClippingsManager();
    break;
    
  case "ae-clippings-show-paste-opts":
    toggleShowPastePrompt(aTab.id);
    break;

  case "ae-clippings-prefs":
    openOptionsPage();
    break;

  default:
    if (aInfo.menuItemId.startsWith("ae-clippings-clipping-")) {
      let id = Number(aInfo.menuItemId.substring(aInfo.menuItemId.lastIndexOf("-") + 1, aInfo.menuItemId.indexOf("_")));
      pasteClippingByID(id, aTab.id);
    }
    else if (aInfo.menuItemId.startsWith("ae-clippings-reset-autoincr-")) {
      let plchldr = aInfo.menuItemId.substr(28);
      resetAutoIncrPlaceholder(plchldr);
    }
    break;
  }
});


messenger.alarms.onAlarm.addListener(async (aAlarm) => {
  info(`Clippings/mx: Alarm "${aAlarm.name}" was triggered.`);

  if (aAlarm.name == "show-upgrade-notifcn") {
    showWhatsNewNotification();
  }
});


messenger.notifications.onClicked.addListener(aNotifID => {
  if (aNotifID == "backup-reminder") {
    // Open Clippings Manager in backup mode.
    openClippingsManager(true);
  }
  else if (aNotifID == "backup-reminder-firstrun") {
    openBackupDlg();
  }
  else if (aNotifID == "sync-helper-update") {
    messenger.tabs.create({url: gSyncClippingsHelperDwnldPgURL});
  }
  else if (aNotifID == "whats-new") {
    messenger.tabs.create({url: messenger.runtime.getURL("pages/whatsnew.html")});
    aePrefs.setPrefs({upgradeNotifCount: 0});
  }
});


messenger.storage.onChanged.addListener((aChanges, aAreaName) => {
  let changedPrefs = Object.keys(aChanges);

  for (let pref of changedPrefs) {
    gPrefs[pref] = aChanges[pref].newValue;

    if (pref == "autoIncrPlchldrStartVal") {
      aeClippingSubst.setAutoIncrementStartValue(aChanges[pref].newValue);
    }
    else if (pref == "showToolsCmd") {
      initToolsMenuItem();
    }
  }
});


messenger.runtime.onMessage.addListener(aRequest => {
  log(`Clippings/mx: Background script received MailExtension message "${aRequest.msgID}"`);

  switch (aRequest.msgID) {
  case "get-env-info":
    let envInfo = {
      os: gOS,
      hostAppName: gHostAppName,
      hostAppVer:  gHostAppVer,
    };
    return Promise.resolve(envInfo);

  case "new-from-selection":
    if (aRequest.content) {
      openNewClippingDlg(aRequest.content);
    }
    else {
      alertEx("msgNoTextSel");
      return;
    }
    break;

  case "init-new-clipping-dlg":
    let newClipping = gNewClipping.get();
    if (newClipping !== null) {
      newClipping.checkSpelling = gPrefs.checkSpelling;
    }
    return Promise.resolve(newClipping);

  case "init-placeholder-prmt-dlg":
    return Promise.resolve(gPlaceholders.get());

  case "close-new-clipping-dlg":
    gWndIDs.newClipping = null;
    break;

  case "close-keybd-paste-dlg":
    gWndIDs.keyboardPaste = null;
    break;

  case "close-paste-options-dlg":
    if (! aRequest.userCancel) {
      pasteProcessedClipping(
        gPastePrompt.get(aRequest.composeTabID),
        aRequest.composeTabID,
        aRequest.pasteAsQuoted
      );
    }
    gPastePrompt.delete(aRequest.composeTabID);
    gWndIDs.pasteClippingOpts = null;
    break;

  case "paste-shortcut-key":
    if (! aRequest.shortcutKey) {
      return;
    }
    messenger.tabs.get(aRequest.composeTabID).then(aTab => {
      if (aTab.type == "messageCompose") {
        pasteClippingByShortcutKey(aRequest.shortcutKey, aTab.id);
      }
    }).catch(aErr => {
      warn("Clippings/mx: Can't find compose tab " + aRequest.composeTabID);
    });
    break;

  case "paste-clipping-by-name":
    messenger.tabs.get(aRequest.composeTabID).then(aTab => {
      if (aTab.type == "messageCompose") {
        pasteClippingByID(aRequest.clippingID, aRequest.composeTabID);
      }
    }).catch(aErr => {
      warn("Clippings/mx: Can't find compose tab " + aRequest.composeTabID);
    });
    break;

  case "paste-clipping-with-plchldrs":
    messenger.tabs.get(aRequest.composeTabID).then(aTab => {
      if (aTab.type != "messageCompose") {
        return null;
      }
      return showPasteOptionsDlg(aTab.id, aRequest.processedContent);
    }).then(aIsDlgShown => {
      // If the Paste Options dialog was shown, control returns to function
      // pasteProcessedClipping() after user clicks OK in the dialog.
      if (aIsDlgShown === false) {
        pasteProcessedClipping(aRequest.processedContent, aRequest.composeTabID);
      }
    }).catch(aErr => {
      warn("Clippings/mx: Can't find compose tab " + aRequest.composeTabID);
    });
    break;

  case "close-placeholder-prmt-dlg":
    gWndIDs.placeholderPrmt = null;
    break;

  case "get-shct-key-prefix-ui-str":
    return Promise.resolve(getShortcutKeyPrefixStr());

  case "clear-backup-notifcn-intv":
    return clearBackupNotificationInterval();

  case "set-backup-notifcn-intv":
    setBackupNotificationInterval();
    break;

  case "backup-clippings":
    openClippingsManager(true);
    break;

  case "get-clippings-backup-data":
    return getClippingsBackupData();

  case "enable-sync-clippings":
    return enableSyncClippings(aRequest.isEnabled);

  case "refresh-synced-clippings":
    refreshSyncedClippings(aRequest.rebuildClippingsMenu);
    break;

  case "push-sync-fldr-updates":
    return pushSyncFolderUpdates();
    
  case "purge-fldr-items":
    return purgeFolderItems(aRequest.folderID);

  case "rebuild-cxt-menu":
    rebuildContextMenu();
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

  case "clipping-changed":
    gClippingsListener.clippingChanged(aRequest.clippingID, aRequest.clippingData, aRequest.oldClippingData);
    break;

  case "folder-changed":
    gClippingsListener.folderChanged(aRequest.folderID, aRequest.folderData, aRequest.oldFolderData);
    break;

  case "copy-started":
    gClippingsListener.copyStarted();
    break;

  case "copy-finished":
    gClippingsListener.copyFinished(aRequest.itemCopyID);
    break;

  case "dnd-move-started":
    gClippingsListener.dndMoveStarted();
    break;

  case "dnd-move-finished":
    gClippingsListener.dndMoveFinished();
    break;

  case "import-started":
    gClippingsListener.importStarted();
    break;

  case "import-finished":
    gClippingsListener.importFinished(aRequest.isSuccess);
    break;
    
  default:
    break;
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
