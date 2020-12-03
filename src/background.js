/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gHostAppName;
let gHostAppVer;
let gOS;

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

  // TO DO: Additional listener methods.
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
};


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

    initMessageListeners();
    
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

  gClippingsDB.open().catch(aErr => {
    console.error(aErr);
  });
}


function initMessageListeners()
{
  messenger.runtime.onMessage.addListener(aRequest => {
    log(`Clippings/mx: Received message "${aRequest.msgID}"`);

    let resp = null;

    if (aRequest.msgID == "init-new-clipping-dlg") {
      resp = gNewClipping.get();

      if (resp !== null) {
        // TEMPORARY
        resp.checkSpelling = true;
        /***
        resp.checkSpelling = gPrefs.checkSpelling;
        ***/
        return Promise.resolve(resp);
      }
    }
    else if (aRequest.msgID == "close-new-clipping-dlg") {
      gWndIDs.newClipping = null;
    }
  });
}


function rebuildContextMenu()
{
  // TO DO: Finish implementation.
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


function openNewClippingDlg(aNewClippingContent)
{
  if (aNewClippingContent) {
    let name = createClippingNameFromText(aNewClippingContent);
    gNewClipping.set({ name, content: aNewClippingContent });
  }
  
  let url = messenger.runtime.getURL("pages/new.html");
  let height = 390;
  if (gOS == "win") {
    height = 420;
  }
  openDlgWnd(url, "newClipping", { type: "detached_panel", width: 428, height });
}


async function openDlgWnd(aURL, aWndKey, aWndPpty)
{
  async function openDlgWndHelper()
  {
    let wnd = await messenger.windows.create({
      url: aURL,
      type: aWndPpty.type,
      width: aWndPpty.width,
      height: aWndPpty.height,
      left: window.screen.availWidth - aWndPpty.width / 2,
      top:  window.screen.availHeight - aWndPpty.height / 2
    });

    gWndIDs[aWndKey] = wnd.id;
  }

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


function getOS()
{
  return gOS;
}


function getHostAppName()
{
  return gHostAppName;
}


function getClippingsListeners()
{
  return gClippingsListeners;
}


function getSyncFolderID()
{
  // TEMPORARY
  return -11;
  /***
  return gSyncFldrID;
  ***/
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
