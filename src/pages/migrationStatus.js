/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const WNDH_MIGRN_ERROR = 230;

let gClippings = null;


// Dialog initialization
$(async () => {
  gClippings = messenger.extension.getBackgroundPage();

  if (! gClippings) {
    throw new Error("Clippings/mx::migrationStatus.js: Failed to retrieve parent application window!");
  }

  let platform = await messenger.runtime.getPlatformInfo();
  document.body.dataset.os = platform.os;

  let prefs = await aePrefs.getAllPrefs();
  document.body.dataset.laf = prefs.enhancedLaF;

  let legacyDataMigrnSuccess = prefs.legacyDataMigrnSuccess;
  if (legacyDataMigrnSuccess) {
    $("#content-migrn-success-deck").show();
  }
  else {
    $("#content-migrn-fail-deck").show();

    let height = WNDH_MIGRN_ERROR;
    messenger.windows.update(messenger.windows.WINDOW_ID_CURRENT, { height });

    // Show the error message from the exception that was thrown when the data
    // migration failed.
    let errMsg = prefs.legacyDataMigrnErrorMsg;
    $("#error-details").val(errMsg);
  }

  $("#open-clippings-mgr").click(aEvent => {
    gClippings.openClippingsManager();
    closeDlg();
  });
  $("#btn-cancel").click(aEvent => { closeDlg() });

  window.focus();
});


$(window).keydown(aEvent => {
  if (aEvent.key == "Enter" || aEvent.key == "Escape") {
    closeDlg();
  }
});


function closeDlg()
{
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}
