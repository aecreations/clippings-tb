/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gClippings;


// Dialog initialization
$(async () => {
  gClippings = messenger.extension.getBackgroundPage();

  if (! gClippings) {
    throw new Error("Clippings/mx::backup.js: Failed to retrieve parent browser window!");
  }

  await preferences.init();
  
  // Reset backup notification interval timer so that it fires 24 hours after
  // displaying this first-time backup dialog.
  gClippings.clearBackupNotificationInterval();
  gClippings.setBackupNotificationInterval();

  let lang = messenger.i18n.getUILanguage();
  if (lang == "fr") {
    $("#backup-hint").css({ letterSpacing: "-0.3px" });
  }

  $("#backup-now").click(aEvent => {
    gClippings.openClippingsManager(true);
  });
  
  $("#btn-close").click(aEvent => { closeDlg() });

  let backupRemFrequency = preferences.getPref("backupRemFrequency", aeConst.BACKUP_REMIND_WEEKLY);
  $("#backup-reminder").prop("checked", (backupRemFrequency != aeConst.BACKUP_REMIND_NEVER)).click(aEvent => {
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

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  let wnd = await messenger.windows.getCurrent();
  messenger.windows.update(wnd.id, {
    width: wnd.width + 1,
    focused: true,
  });
});


function closeDlg()
{
  messenger.windows.remove(browser.windows.WINDOW_ID_CURRENT);
}


$(window).on("contextmenu", aEvent => {
  if (aEvent.target.tagName != "INPUT" && aEvent.target.tagName != "TEXTAREA") {
    aEvent.preventDefault();
  }
});


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
