/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gHostAppName;
let gHostAppVer;
let gOS;


messenger.runtime.onInstalled.addListener(async (aInstall) => {
  if (aInstall.reason == "install") {
    info("Clippings/mx: MailExtension installed.");
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


messenger.runtime.onStartup.addListener(() => {
  init();
})


function init()
{
  info("Clippings/mx: Initializing integration of MailExtension with host app...");

  initClippingsDB();

  let getMsngrInfo = messenger.runtime.getBrowserInfo();
  let getPlatInfo = messenger.runtime.getPlatformInfo();

  Promise.all([getMsngrInfo, getPlatInfo]).then(aResults => {
    let msngr = aResults[0];
    let platform = aResults[1];
    
    gHostAppName = msngr.name;
    gHostAppVer = msngr.version;
    log(`Clippings/mx: Host app: ${gHostAppName} (version ${gHostAppVer})`);

    gOS = platform.os;
    log("Clippings/mx: OS: " + gOS);

    messenger.WindowListener.registerDefaultPrefs("defaults/preferences/prefs.js");

    messenger.WindowListener.registerChromeUrl([
      ["content",  "clippings", "chrome/content/"],
      ["locale",   "clippings", "en-US", "chrome/locale/en-US/"],
      ["resource", "clippings", "./"]
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

  gClippingsDB.open().catch(aErr => { onError(aErr) });
}


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
