/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gClippings;
let gDialogs = {};
let gIsActivatingSyncClippings = false;


// DOM utility
function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, { SAFE_FOR_JQUERY: true });
}


// Options page initialization
$(async () => {
  gClippings = await messenger.runtime.getBackgroundPage();

  if (! gClippings) {
    // Hide the broken "Turn Off Sync" button when Private Browsing turned on.
    $("#toggle-sync").hide();
    
    window.alert(messenger.i18n.getMessage("errPrefPgFailed"));
    await closePage();
    return;
  }

  init();
});


async function init()
{
  await preferences.init();
  
  let os = gClippings.getOS();

  if (os == "mac") {
    // TO DO: Mac-specific keys for shortcut mode.
  }

  // Fit text on one line for various locales.
  if (os != "mac") {
    let lang = messenger.i18n.getUILanguage();
    if (lang == "de") {
      $("#enable-shortcut-key-label").css({ fontSize: "13px", letterSpacing: "-0.25px" });
      $("#shortcut-key-prefix-modifiers").css({ fontSize: "13px", letterSpacing: "-0.25px" });
    }
    else if (lang == "es-ES") {
      $("#enable-shortcut-key-label").css({ fontSize: "13px", letterSpacing: "-0.46px" });
      $("#shortcut-key-prefix-modifiers").css({ fontSize: "13px", letterSpacing: "-0.46px" });     
    }
  }
  
  $("#sync-intro").html(sanitizeHTML(messenger.i18n.getMessage("syncIntro")));

  initDialogs();

  let syncClippings = preferences.getPref("syncClippings", false);

  $("#toggle-sync").click(async (aEvent) => {
    if (syncClippings) {
      gDialogs.turnOffSync.showModal();
    }
    else {
      gIsActivatingSyncClippings = true;
      gDialogs.syncClippings.showModal();
    }
  });

  $("#about-btn").click(aEvent => {
    gDialogs.about.showModal();
  });

  let usrContribCTA = $("#usr-contrib-cta");
  usrContribCTA.append(sanitizeHTML(`<label id="usr-contrib-cta-hdg">${messenger.i18n.getMessage("aboutContribHdg")}</label>&nbsp;`));
  usrContribCTA.append(sanitizeHTML(`<a href="${aeConst.DONATE_URL}" class="hyperlink">${messenger.i18n.getMessage("aboutDonate")}</a>&nbsp;`));
  usrContribCTA.append(sanitizeHTML(`<label id="usr-contrib-cta-conj">${messenger.i18n.getMessage("aboutContribConj")}</label>`));
  usrContribCTA.append(sanitizeHTML(`<a href="${aeConst.L10N_URL}" class="hyperlink">${messenger.i18n.getMessage("aboutL10n")}</a>`));
  
  // Handling keyboard events in open modal dialogs.
  $(window).keydown(aEvent => {
    function isAccelKeyPressed()
    {
      let rv;
      if (os == "mac") {
        rv = aEvent.metaKey;
      }
      else {
        rv = aEvent.ctrlKey;
      }
      
      return rv;
    }

    function isTextboxFocused(aEvent)
    {
      return (aEvent.target.tagName == "INPUT" || aEvent.target.tagName == "TEXTAREA");
    }

    if (aEvent.key == "Enter" && aeDialog.isOpen()) {
      aeDialog.acceptDlgs();

      // Don't trigger any further actions that would have occurred if the
      // ENTER key was pressed.
      aEvent.preventDefault();
    }
    else if (aEvent.key == "Escape" && aeDialog.isOpen()) {
      aeDialog.cancelDlgs();
    }
    else if (aEvent.key == "/" || aEvent.key == "'") {
      if (! isTextboxFocused(aEvent)) {
        aEvent.preventDefault();  // Suppress quick find in page.
      }
    }
    else if (aEvent.key == "F5") {
      aEvent.preventDefault();  // Suppress browser reload.
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

  let htmlPaste = preferences.getPref("htmlPaste", aeConst.HTMLPASTE_AS_FORMATTED);
  $("#html-paste-options").val(htmlPaste).change(aEvent => {
    preferences.setPref("htmlPaste", aEvent.target.value);
  });

  let autoLineBreak = preferences.getPref("autoLineBreak", true);
  $("#html-auto-line-break").attr("checked", autoLineBreak).click(aEvent => {
    preferences.setPref("autoLineBreak", aEvent.target.checked);
  });

  let keyboardPaste = preferences.getPref("keyboardPaste", true);
  $("#enable-shortcut-key").attr("checked", keyboardPaste).click(aEvent => {
    preferences.setPref("keyboardPaste", aEvent.target.checked);
  });

  let autoIncrPlchldrStartVal = preferences.getPref("autoIncrPlchldrStartVal", 0);
  $("#auto-inc-plchldrs-start-val").val(autoIncrPlchldrStartVal).click(aEvent => {
    preferences.setPref("autoIncrPlchldrStartVal", aEvent.target.valueAsNumber);
  });

  let checkSpelling = preferences.getPref("checkSpelling", true);
  $("#check-spelling").attr("checked", checkSpelling).click(aEvent => {
    preferences.setPref("checkSpelling", aEvent.target.checked);
  });

  let backupFilenameWithDate = preferences.getPref("backupFilenameWithDate", true);
  $("#backup-filename-with-date").attr("checked", backupFilenameWithDate).click(aEvent => {
    preferences.setPref("backupFilenameWithDate", aEvent.target.checked);
  });

  let backupRemFrequency = preferences.getPref("backupRemFrequency", aeConst.BACKUP_REMIND_WEEKLY);
  $("#backup-reminder").prop("checked", (backupRemFrequency != aeConst.BACKUP_REMIND_NEVER)).click(async (aEvent) => {
    if (aEvent.target.checked) {
      $("#backup-reminder-freq").prop("disabled", false);
      preferences.setPref("backupRemFrequency", Number($("#backup-reminder-freq").val()));
      preferences.setPref("backupRemFirstRun", false);
      preferences.setPref("lastBackupRemDate", new Date().toString());
    }
    else {
      $("#backup-reminder-freq").prop("disabled", true);
      preferences.setPref("backupRemFrequency", aeConst.BACKUP_REMIND_NEVER);
    }

    gClippings.clearBackupNotificationInterval();
    if (aEvent.target.checked) {
      gClippings.setBackupNotificationInterval();
    }
  });

  if (backupRemFrequency == aeConst.BACKUP_REMIND_NEVER) {
    // Set to default interval.
    $("#backup-reminder-freq").val(aeConst.BACKUP_REMIND_WEEKLY).prop("disabled", true);
  }
  else {
    $("#backup-reminder-freq").val(backupRemFrequency);
  }
  
  $("#backup-reminder-freq").change(async (aEvent) => {
    preferences.setPref("backupRemFrequency", Number(aEvent.target.value));
    preferences.setPref("backupRemFirstRun", false);
    preferences.setPref("lastBackupRemDate", new Date().toString());

    gClippings.clearBackupNotificationInterval();
    gClippings.setBackupNotificationInterval();
  });   

  if (syncClippings) {
    $("#sync-settings").show();
    $("#sync-status").addClass("sync-status-on").text(messenger.i18n.getMessage("syncStatusOn"));
    $("#toggle-sync").text(messenger.i18n.getMessage("syncTurnOff"));
  }
  else {
    $("#sync-settings").hide();
    $("#sync-status").text(messenger.i18n.getMessage("syncStatusOff"));
    $("#toggle-sync").text(messenger.i18n.getMessage("syncTurnOn"));
  }

  $("#sync-settings").click(aEvent => {
    gDialogs.syncClippings.showModal();
  });
  /***
      $("#browse-sync-fldr").click(aEvent => {
      let msg = { msgID: "sync-dir-folder-picker" };
      let sendNativeMsg = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);

      sendNativeMsg.then(aResp => {
      if (aResp.syncFilePath) {
      $("#sync-fldr-curr-location").val(aResp.syncFilePath);
      }
      }).catch(aErr => {
      window.alert("The Sync Clippings helper app responded with an error.\n\n" + aErr);
      });
      });
  ***/
  
  $("#show-sync-help").click(aEvent => {
    gDialogs.syncClippingsHelp.showModal();
  });

  $(".hyperlink").click(aEvent => {
    aEvent.preventDefault();
    gotoURL(aEvent.target.href);
  });
}


function initDialogs()
{
  let osName = gClippings.getOS();
  $(".msgbox-icon").attr("os", osName);
  
  gDialogs.syncClippings = new aeDialog("#sync-clippings-dlg");
  gDialogs.syncClippings.oldShowSyncItemsOpt = null;
  gDialogs.syncClippings.isCanceled = false;
  gDialogs.syncClippings.onInit = () => {
    gDialogs.syncClippings.isCanceled = false;
    $("#sync-clippings-dlg .dlg-accept").hide();
    $("#sync-clippings-dlg .dlg-cancel").text(messenger.i18n.getMessage("btnCancel"));
    $("#sync-err-detail").text("");
    
    let deckSyncChk = $("#sync-connection-check");
    let deckSyncConxnError = $("#sync-cxn-error");
    let deckSyncError = $("#generic-error");
    let deckSyncSettings = $("#sync-folder-location");

    deckSyncChk.show();
    deckSyncConxnError.hide();
    deckSyncError.hide();
    deckSyncSettings.hide();

    let lang = messenger.i18n.getUILanguage();
    let msg = { msgID: "get-app-version" };
    let sendNativeMsg = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    sendNativeMsg.then(aResp => {
      console.info("Sync Clippings helper app version: " + aResp.appVersion);

      let syncHelperCheckUpdates = preferences.getPref("syncHelperCheckUpdates", true);
      $("#sync-helper-app-update-check").prop("checked", syncHelperCheckUpdates);

      let cxtMenuSyncItemsOnly = preferences.getPref("cxtMenuSyncItemsOnly", false);
      $("#show-only-sync-items").prop("checked", cxtMenuSyncItemsOnly);

      gDialogs.syncClippings.oldShowSyncItemsOpt = $("#show-only-sync-items").prop("checked");

      if (lang == "de") {
        $("#sync-helper-app-update-check + label").css({ letterSpacing: "-0.51px" });
      }
      else if (lang == "pt-BR") {
        $("#sync-helper-app-update-check + label").css({ letterSpacing: "-0.56px" });
      }

      let msg = { msgID: "get-sync-dir" };
      return messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
      
    }).then(aResp => {
      if (! gDialogs.syncClippings.isCanceled) {
        $("#sync-clippings-dlg").css({ height: "336px" });

        if (lang == "es-ES") {
          $("#sync-clippings-dlg").css({ width: "606px" });
          $("#sync-helper-app-update-check + label").css({ letterSpacing: "-0.56px" });
        }
      }
      $("#sync-clippings-dlg .dlg-accept").show();
      $("#sync-clippings-dlg .dlg-cancel").text(messenger.i18n.getMessage("btnCancel"));

      deckSyncChk.hide();
      deckSyncSettings.show();
      $("#sync-fldr-curr-location").val(aResp.syncFilePath).focus().select();

    }).catch(aErr => {
      console.error("Clippings/wx::options.js: Error returned from syncClippings native app: " + aErr);
      
      $("#sync-clippings-dlg .dlg-cancel").text(messenger.i18n.getMessage("btnClose"));

      if (aErr == aeConst.SYNC_ERROR_CONXN_FAILED) {
        // This would occur if Sync Clippings helper app won't start.
        deckSyncChk.hide();
        deckSyncConxnError.show();
      }
      else if (aErr == aeConst.SYNC_ERROR_UNKNOWN) {
        deckSyncChk.hide();
        deckSyncSettings.hide();
        deckSyncError.show();
        $("#sync-err-detail").text(messenger.i18n.getMessage("errNoDetails"));
      }
      else {
        deckSyncChk.hide();
        deckSyncSettings.hide();
        deckSyncError.show();
        $("#sync-err-detail").text(messenger.i18n.getMessage("errSyncOptsInit"));
      }
    });
  };
  gDialogs.syncClippings.onAccept = () => {
    let that = gDialogs.syncClippings;

    let syncFldrPath = $("#sync-fldr-curr-location").val();

    // Sanitize the sync folder path value.
    syncFldrPath = syncFldrPath.trim();
    syncFldrPath = syncFldrPath.replace(/\"/g, "");
    
    if (! syncFldrPath) {
      $("#sync-fldr-curr-location").focus();
      return;
    }

    preferences.setPref("syncHelperCheckUpdates", $("#sync-helper-app-update-check").prop("checked"));
    preferences.setPref("cxtMenuSyncItemsOnly", $("#show-only-sync-items").prop("checked"));

    let rebuildClippingsMenu = $("#show-only-sync-items").prop("checked") != gDialogs.syncClippings.oldShowSyncItemsOpt;

    let msg = {
      msgID: "set-sync-dir",
      filePath: syncFldrPath
    };
    log("Sending message 'set-sync-dir' with params:");
    log(msg);

    let setSyncFilePath = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    setSyncFilePath.then(aResp => {
      log("Received response to 'set-sync-dir':");
      log(aResp);

      if (aResp.status == "ok") {
        gClippings.enableSyncClippings(true).then(aSyncFldrID => {
	  if (gIsActivatingSyncClippings) {
            // Don't do the following if Sync Clippings was already turned on
            // and no changes to settings were made.
            preferences.setPref("syncClippings", true);
            preferences.setPref("clippingsMgrShowSyncItemsOnlyRem", true);

            $("#sync-settings").show();
            $("#toggle-sync").text(messenger.i18n.getMessage("syncTurnOff"));
            $("#sync-status").addClass("sync-status-on").text(messenger.i18n.getMessage("syncStatusOn"));

	    gIsActivatingSyncClippings = false;
	  }

          gClippings.refreshSyncedClippings(rebuildClippingsMenu);  // Asynchronous function.
          
	  let syncClippingsListeners = gClippings.getSyncClippingsListeners().getListeners();
	  for (let listener of syncClippingsListeners) {
	    listener.onActivate(aSyncFldrID);
	  }
	  
	  that.close();
        });
      }
      else {
        window.alert(`The Sync Clippings helper app responded with an error.\n\nStatus: ${aResp.status}\nDetails: ${aResp.details}`);
        that.close();
      }     
    }).catch(aErr => {
      console.error(aErr);
    });
  };
  gDialogs.syncClippings.onUnload = () => {
    $("#sync-clippings-dlg").css({ height: "256px" });
    gDialogs.syncClippings.isCanceled = true;
  };

  // Dialog UI strings
  if (osName == "win") {
    $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExWin"));
  }
  else if (osName == "mac") {
    $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExMac"));
  }
  else {
    $("#example-sync-path").text(messenger.i18n.getMessage("syncFileDirExLinux"));
  }
  $("#sync-conxn-error-detail").html(sanitizeHTML(messenger.i18n.getMessage("errSyncConxnDetail")));

  gDialogs.turnOffSync = new aeDialog("#turn-off-sync-clippings-dlg");
  $("#turn-off-sync-clippings-dlg > .dlg-btns > .dlg-btn-yes").click(aEvent => {
    let that = gDialogs.turnOffSync;
    that.close();

    gClippings.enableSyncClippings(false).then(aOldSyncFldrID => {
      preferences.setPref("syncClippings", false);
      $("#sync-settings").hide();
      $("#toggle-sync").text(messenger.i18n.getMessage("syncTurnOn"));
      $("#sync-status").removeClass("sync-status-on").text(messenger.i18n.getMessage("syncStatusOff"));

      let syncClippingsListeners = gClippings.getSyncClippingsListeners().getListeners();
      for (let listener of syncClippingsListeners) {
	listener.onDeactivate(aOldSyncFldrID);
      }

      gDialogs.turnOffSyncAck.oldSyncFldrID = aOldSyncFldrID;
      gDialogs.turnOffSyncAck.showModal();
    });
  });

  gDialogs.turnOffSyncAck = new aeDialog("#turn-off-sync-clippings-ack-dlg");
  gDialogs.turnOffSyncAck.oldSyncFldrID = null;
  gDialogs.turnOffSyncAck.onInit = () => {
    $("#delete-sync-fldr").prop("checked", true);
  };
  gDialogs.turnOffSyncAck.onAfterAccept = () => {
    let that = gDialogs.turnOffSyncAck;
    let removeSyncFldr = $("#delete-sync-fldr").prop("checked");
    let syncClippingsListeners = gClippings.getSyncClippingsListeners().getListeners();

    for (let listener of syncClippingsListeners) {
      listener.onAfterDeactivate(removeSyncFldr, that.oldSyncFldrID);
    }
  };

  gDialogs.about = new aeDialog("#about-dlg");
  gDialogs.about.extInfo = null;
  gDialogs.about.onInit = () => {
    let that = gDialogs.about;
    
    let diagDeck = $("#about-dlg > .dlg-content #diag-info .deck");
    diagDeck.children("#sync-diag-loading").show();
    diagDeck.children("#sync-diag").hide();
    $("#about-dlg > .dlg-content #diag-info #sync-diag-detail").hide();
    $("#about-dlg > .dlg-content #diag-info #sync-file-size").text("");

    if (! that.extInfo) {
      let extManifest = messenger.runtime.getManifest();
      that.extInfo = {
        name: extManifest.name,
        version: extManifest.version,
        description: extManifest.description,
        homePgURL: extManifest.homepage_url,
      };
    }

    $("#about-dlg > .dlg-content #ext-name").text(that.extInfo.name);
    $("#about-dlg > .dlg-content #ext-ver").text(messenger.i18n.getMessage("aboutExtVer", that.extInfo.version));
    $("#about-dlg > .dlg-content #ext-desc").text(that.extInfo.description);
    $("#about-dlg > .dlg-content #ext-home-pg").attr("href", that.extInfo.homePgURL);

    let lang = messenger.i18n.getUILanguage();
    if (lang == "de") {
      $("#usr-contrib-cta").css({ letterSpacing: "-0.1px" });
    }
    else if (lang == "pt-BR") {
      $("#ext-desc").css({ letterSpacing: "-0.55px" });
    }
    else if (lang == "es-ES") {
      $("#sync-ver-label").css({ letterSpacing: "-0.15px" });
    }
  };
  gDialogs.about.onShow = () => {
/***
    let msg = { msgID: "get-app-version" };
    let sendNativeMsg = messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
    sendNativeMsg.then(aResp => {
      $("#about-dlg > .dlg-content #diag-info #sync-ver").text(aResp.appVersion);     

      let syncClippings = preferences.getPref("syncClippings", false);
      if (syncClippings) {
        let msg = { msgID: "get-sync-file-info" };
        return messenger.runtime.sendNativeMessage(aeConst.SYNC_CLIPPINGS_APP_NAME, msg);
      }
      else {
        return null;
      }
    }).then(aResp => {
      if (aResp) {
        let syncFileSize;
        if (aResp.fileSizeKB == "") {
          // Sync Clippings is turned on, but sync file is not yet created.
          syncFileSize = "-";
        }
        else {
          syncFileSize = `${aResp.fileSizeKB} KiB`;
        }
        $("#about-dlg > .dlg-content #diag-info #about-sync-status").hide();
        $("#about-dlg > .dlg-content #diag-info #sync-file-size-label").show();
        $("#about-dlg > .dlg-content #diag-info #sync-file-size").text(syncFileSize);
      }
      else {
        // Sync Clippings is inactive.
        $("#about-dlg > .dlg-content #diag-info #sync-file-size-label").hide();
        $("#about-dlg > .dlg-content #diag-info #about-sync-status").text(messenger.i18n.getMessage("syncStatusOff")).show();
      }
      
      $("#about-dlg > .dlg-content #diag-info #sync-diag-detail").show();

    }).catch(aErr => {
      // Native app is not installed.
      log("Clippings/wx: About dialog: Error returned from native app: " + aErr);
      $("#about-dlg > .dlg-content #diag-info #sync-ver").text(messenger.i18n.getMessage("noSyncHelperApp"));
      
    }).finally(() => {
      let diagDeck = $("#about-dlg > .dlg-content #diag-info .deck");
      diagDeck.children("#sync-diag-loading").hide();
      diagDeck.children("#sync-diag").show();
    });
***/
  };
  
  gDialogs.syncClippingsHelp = new aeDialog("#sync-clippings-help-dlg");

  // Sync Clippings help dialog content.
  $("#sync-clippings-help-dlg > .dlg-content").html(sanitizeHTML(messenger.i18n.getMessage("syncHelp")));
}


$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.tagName != "TEXTAREA") {
    aEvent.preventDefault();
  }
});


function gotoURL(aURL)
{
  messenger.tabs.create({ url: aURL });
}


async function closePage()
{
  let tab = await messenger.tabs.getCurrent();
  messenger.tabs.remove(tab.id);
}


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
