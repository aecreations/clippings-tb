/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");


var aeClippingsLegacy = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      aeClippingsLegacy: {
	DEBUG: false,
	CLIPPINGS_JSON_FILENAME: "clippings.json",

	async getPref(aPrefName, aDefaultValue)
	{
          let rv;
	  let prefs = Services.prefs;
	  let prefType = prefs.getPrefType(aPrefName);

	  if (prefType == prefs.PREF_STRING) {
	    rv = prefs.getCharPref(aPrefName);
	  }
	  else if (prefType == prefs.PREF_INT) {
	    rv = prefs.getIntPref(aPrefName);
	  }
	  else if (prefType == prefs.PREF_BOOL) {
	    rv = prefs.getBoolPref(aPrefName);
	  }
          else {
            // Pref doesn't exist if prefType == prefs.PREF_INVALID.
            rv = aDefaultValue;
          }

	  return rv;
	},

        async clearPref(aPrefName)
        {
          let prefs = Services.prefs;
          prefs.clearUserPref(aPrefName);
        },
        
	async getClippingsFromJSONFile()
	{
          let rv = await this._getDataFromFile(this.CLIPPINGS_JSON_FILENAME);

	  return rv;
	},

        async insertClipping(aClippingID)
        {
          let wndMediatorSvc = Services.wm;
          let composerWnd = wndMediatorSvc.getMostRecentWindow("msgcompose");
          await composerWnd.aecreations.clippings.insertClipping(aClippingID);
        },


	//
        // Helper methods
        //

        async _getDataFromFile(aFileName)
        {
          let rv;
          let filePath = await this.getPref(
            "extensions.aecreations.clippings.datasource.location", ""
          );

          this._log("aeClippingsLegacy._getDataFromFile(): Data source location: " + filePath);

          if (filePath) {
            filePath = OS.Path.join(filePath, aFileName);
          }
          else {
            let dirProp = Services.dirsvc;
	    let profileDir = dirProp.get("ProfD", Components.interfaces.nsIFile);
	    let path = profileDir.path;
            filePath = OS.Path.join(path, aFileName);
          }

          try {
	    rv = await OS.File.read(filePath, { encoding: "utf-8" });
	  }
	  catch (e) {
            rv = null;
          }

          return rv;
        },
        
	_log(aMessage)
	{
	  if (this.DEBUG) {
	    Services.console.logStringMessage(aMessage);
	  }
	}
      }
    };
  }
};
