/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
// Integration with main window
//


if (! ('aecreations' in window)) {
  window.aecreations = {};
}

if (! ('clippings' in window.aecreations)) {
  window.aecreations.clippings = {};
}
else {
  throw new Error("clippings object already defined");
}

window.aecreations.clippings = {
  isClippingsInitialized: false,
  showDialog:             true,
  _clippingsMxListener:   null,

  
  addMxListener: function (aListener)
  {
    this._clippingsMxListener = aListener;
  },

  removeMxListener: function ()
  {
    this._clippingsMxListener = null;
  },

  getMxListener: function ()
  {
    return this._clippingsMxListener;
  },


  //
  // Browser window and Clippings menu initialization
  //

  async initClippings()
  {  
    // Workaround to this init function being called multiple times.
    if (this.isClippingsInitialized) {
      return;
    }

    this.util.aeUtils.log(`initClippings(): Clippings data source successfully loaded.\nHost app: ${this.util.aeUtils.getHostAppName()} (version ${this.util.aeUtils.getHostAppVersion()})\nOS identifier: ${this.util.aeUtils.getOS()}\nInitializing Clippings integration with host app window: ${window.location.href}`);

    window.setTimeout(() => {
      this.getMxListener().legacyDataMigrationVerified();
    }, 3000);

    this.isClippingsInitialized = true;
  },


  //
  // Methods invoked by overlay code
  //

  openClippingsManager: function () 
  {
    this.getMxListener().clippingsManagerWndOpened();
  }
};

window.aecreations.clippings.util = ChromeUtils.import("resource://clippings/modules/aeUtils.js");
