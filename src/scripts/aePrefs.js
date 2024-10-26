/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


let aePrefs = function () {
  let _defaultPrefs = {
    htmlPaste: aeConst.HTMLPASTE_AS_FORMATTED,
    autoLineBreak: true,
    autoIncrPlchldrStartVal: 0,
    keybdPaste: true,
    checkSpelling: true,
    pastePromptAction: aeConst.PASTEACTION_SHORTCUT_KEY,
    clippingsMgrAutoShowDetailsPane: true,
    clippingsMgrDetailsPane: false,
    clippingsMgrStatusBar: false,
    clippingsMgrPlchldrToolbar: false,
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
    legacyDataMigrnErrorMsg: "",
    clippingsMgrCleanUpIntv: aeConst.CLIPPINGSMGR_CLEANUP_INTERVAL_MS,
    clippingsMgrAutoSaveIntv: aeConst.CLIPPINGSMGR_AUTOSAVE_INTERVAL_MS,
    skipBackupRemIfUnchg: true,
    clippingsUnchanged: false,
    clippingsMgrSaveWndGeom: false,
    clippingsMgrSaveWndGeomIntv: 2000,
    clippingsMgrWndGeom: null,
    clippingsMgrTreeWidth: null,
    autoAdjustWndPos: null,
    upgradeNotifCount: 0,
    showNewClippingOpts: false,
    compressSyncData: true,
    isSyncReadOnly: false,
    showShctKey: false,
    showShctKeyDispStyle: aeConst.SHCTKEY_DISPLAY_PARENS,
    defDlgBtnFollowsFocus: false,
    showToolsCmd: true,

    // Deprecated prefs - these will be removed during extension upgrade.
    clippingsMgrMinzWhenInactv: null,
    enhancedLaF: true,
    keyboardPaste: true,
    wxPastePrefixKey: true,
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
    },


    //
    // Version upgrade handling
    //

    hasSantaBarbaraPrefs(aPrefs)
    {
      // Version 6.0
      return ("htmlPaste" in aPrefs);
    },
    
    hasCarpinteriaPrefs(aPrefs)
    {
      // Version 6.1
      return ("skipBackupRemIfUnchg" in aPrefs);
    },

    async setCarpinteriaPrefs(aPrefs)
    {
      let newPrefs = {
        skipBackupRemIfUnchg: true,
        clippingsUnchanged: false,
        clippingsMgrSaveWndGeom: false,
        clippingsMgrSaveWndGeomIntv: 2000,
        clippingsMgrWndGeom: null,
        clippingsMgrTreeWidth: null,
        autoAdjustWndPos: null,
        upgradeNotifCount: 0,
      };

      await this._addPrefs(aPrefs, newPrefs);
    },

    hasVenturaPrefs(aPrefs)
    {
      // Version 6.1.1
      return ("legacyDataMigrnErrorMsg" in aPrefs);
    },

    async setVenturaPrefs(aPrefs)
    {
      let newPrefs = {
        legacyDataMigrnErrorMsg: "",
      };

      await this._addPrefs(aPrefs, newPrefs);
    },

    hasCorralDeTierraPrefs(aPrefs)
    {
      // Version 6.2
      return ("showNewClippingOpts" in aPrefs);
    },

    async setCorralDeTierraPrefs(aPrefs)
    {
      let newPrefs = {showNewClippingOpts: false};
      await this._addPrefs(aPrefs, newPrefs);
    },

    hasSanFranciscoPrefs(aPrefs)
    {
      // Version 7.0
      return ("compressSyncData" in aPrefs);
    },

    async setSanFranciscoPrefs(aPrefs)
    {
      let newPrefs = {
        compressSyncData: true,
        isSyncReadOnly: false,
        showShctKey: false,
        showShctKeyDispStyle: aeConst.SHCTKEY_DISPLAY_PARENS,
        defDlgBtnFollowsFocus: false,
        showToolsCmd: true,
        keybdPaste: true,
      };

      // Removed deprecated prefs.
      delete aPrefs.enhancedLaF;
      delete aPrefs.clippingsMgrMinzWhenInactv;
      await this._removePrefs("enhancedLaF", "clippingsMgrMinzWhenInactv");

      await this._addPrefs(aPrefs, newPrefs);
    },

    async migrateKeyboardPastePref(aPrefs, aOSName)
    {
      if ("wxPastePrefixKey" in aPrefs) {
        let keybdPaste = aOSName == "mac" ? aPrefs.keyboardPaste : aPrefs.wxPastePrefixKey;
        aPrefs.keybdPaste = keybdPaste;
        await this.setPrefs({keybdPaste});

        delete aPrefs.keyboardPaste;
        delete aPrefs.wxPastePrefixKey;
        await this._removePrefs("keyboardPaste", "wxPastePrefixKey");
      }
    },

    
    //
    // Helper methods
    //
    
    async _addPrefs(aCurrPrefs, aNewPrefs)
    {
      for (let pref in aNewPrefs) {
        aCurrPrefs[pref] = aNewPrefs[pref];
      }
      await this.setPrefs(aNewPrefs);
    },

    async _removePrefs(...aPrefs)
    {
      await messenger.storage.local.remove(aPrefs);
    },
  };
}();
