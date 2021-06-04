/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


let aePrefs = function () {
  let _defaultPrefs = {
    htmlPaste: aeConst.HTMLPASTE_AS_FORMATTED,
    autoLineBreak: true,
    autoIncrPlchldrStartVal: 0,
    keyboardPaste: true,
    wxPastePrefixKey: true,
    checkSpelling: true,
    pastePromptAction: aeConst.PASTEACTION_SHORTCUT_KEY,
    clippingsMgrAutoShowDetailsPane: true,
    clippingsMgrDetailsPane: false,
    clippingsMgrStatusBar: false,
    clippingsMgrPlchldrToolbar: false,
    clippingsMgrMinzWhenInactv: null,
    syncClippings: false,
    syncFolderID: null,
    cxtMenuSyncItemsOnly: false,
    clippingsMgrShowSyncItemsOnlyRem: true,
    lastBackupRemDate: null,
    backupRemFirstRun: true,
    backupRemFrequency: aeConst.BACKUP_REMIND_WEEKLY,
    afterSyncFldrReloadDelay: 3000,
    syncHelperCheckUpdates: true,
    lastSyncHelperUpdChkDate: null,
    backupFilenameWithDate: true,
    legacyDataMigrnSuccess: null,
    showLegacyDataMigrnStatus: null,
    clippingsMgrCleanUpIntv: aeConst.CLIPPINGSMGR_CLEANUP_INTERVAL_MS,
    clippingsMgrAutoSaveIntv: aeConst.CLIPPINGSMGR_AUTOSAVE_INTERVAL_MS,
  };

  return {
    getDefaultPrefs()
    {
      return _defaultPrefs;
    },

    getPrefKeys()
    {
      return Object.keys(_defaultPrefs);
    },

    async getPref(aPrefName)
    {
      let pref = await messenger.storage.local.get(aPrefName);
      let rv = pref[aPrefName];
      
      return rv;
    },

    async getAllPrefs()
    {
      let rv = await messenger.storage.local.get(this.getPrefKeys());
      return rv;
    },

    async setPrefs(aPrefMap)
    {
      await messenger.storage.local.set(aPrefMap);
    }
  };
}();
