/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const WNDH_MIGRN_ERROR = 222;

let gClippings = null;


// Dialog initialization
$(async () => {
  gClippings = messenger.extension.getBackgroundPage();

  if (! gClippings) {
    throw new Error("Clippings/mx::migrationStatus.js: Failed to retrieve parent application window!");
  }

  let resp = await messenger.runtime.sendMessage({msgID: "get-env-info"});
  document.body.dataset.os = resp.os;

  let prefs = await messenger.storage.local.get("legacyDataMigrnSuccess");

  if (prefs.legacyDataMigrnSuccess) {
    $("#content-migrn-success-deck").show();
  }
  else {
    $("#content-migrn-fail-deck").show();
    let height = WNDH_MIGRN_ERROR;
    messenger.windows.update(messenger.windows.WINDOW_ID_CURRENT, { height });
  }

  $("#open-clippings-mgr").click(aEvent => {
    gClippings.openClippingsManager();
    closeDlg();
  });
  $("#save-legacy-data").click(aEvent => {
    saveLegacyData();
  });
  $("#btn-cancel").click(aEvent => { closeDlg() });

  window.focus();
});


async function saveLegacyData()
{
  let clippingsData = await messenger.aeClippingsLegacy.getClippingsFromJSONFile();

  if (clippingsData === null) {
    throw new Error("Failed to retrieve data from clippings.json - file not found");
  }

  let blobData = new Blob([clippingsData], { type: "application/json;charset=utf-8"});

  let downldItemID;
  try {
    downldItemID = await messenger.downloads.download({
      url: URL.createObjectURL(blobData),
      filename: aeConst.CLIPPINGS_EXPORT_FILENAME,
      saveAs: true
    });

    $("#save-confirm-msg").css({ visibility: "visible" });
  }
  catch (e) {
    if (e.fileName == "undefined") {
      // User cancelled
    }
    else {
      window.alert(e);
    }
  }
  finally {
    window.focus();
  }
}


$(window).keydown(aEvent => {
  if (aEvent.key == "Enter" || aEvent.key == "Escape") {
    closeDlg();
  }
});


function closeDlg()
{
  messenger.windows.remove(messenger.windows.WINDOW_ID_CURRENT);
}
