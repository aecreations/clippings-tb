/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// TO DO: Put this constant in the `aeConst` module.
const DEBUG = true;


messenger.runtime.onInstalled.addListener(async (install) => {
  if (install.reason == "install") {
    info("Clippings/mx: MailExtension installed.");
    await init();
  }
  else if (install.reason == "update") {
    let oldVer = install.previousVersion;
    let currVer = messenger.runtime.getManifest().version;
    log(`Clippings/mx: Upgrading from version ${oldVer} to ${currVer}`);

    // TO DO: Check if Clippings was previously installed.
    // If so, migrate Clippings data from clippings.json.

    init();
  }
});


messenger.runtime.onStartup.addListener(async () => {
  init();
})


async function init()
{
  info("Clippings/mx: Initializing integration of MailExtension with host app...");

  let hostApp = await messenger.runtime.getBrowserInfo();
  log(`Clippings/mx: Host app: ${hostApp.name} (version ${hostApp.version})`);

  messenger.WindowListener.registerDefaultPrefs("defaults/preferences/prefs.js");

  messenger.WindowListener.registerChromeUrl([
    ["content",  "clippings", "chrome/content/"],
    ["locale",   "clippings", "en-US", "chrome/locale/en-US/"],
    ["resource", "clippings", "./"]
  ]);

  messenger.WindowListener.registerOptionsPage("chrome://clippings/content/preferences.xul");

  // TO DO: Change XUL file name extension to .xhtml when ready to switch to
  // Thunderbird 78.
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/messenger.xul",
    "chrome://clippings/content/messenger.js"
  );
  messenger.WindowListener.registerWindow(
    "chrome://messenger/content/messengercompose/messengercompose.xul",
    "chrome://clippings/content/messengercompose.js"
  );
  
  messenger.WindowListener.startListening();
  
  log("Clippings/mx: MailExtension initialization complete.");
}


//
// Error reporting and debugging output
//

function log(aMessage)
{
  if (DEBUG) { console.log(aMessage); }
}


function info(aMessage)
{
  if (DEBUG) { console.info(aMessage); }
}


function warn(aMessage)
{
  if (DEBUG) { console.warn(aMessage); }
}
