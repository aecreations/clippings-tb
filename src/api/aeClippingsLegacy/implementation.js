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
	DEBUG: true,
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
          let rv;
          let jsonFilePath = await this.getPref(
            "extensions.aecreations.clippings.datasource.location", ""
          );

          if (jsonFilePath) {
            jsonFilePath = OS.Path.join(jsonFilePath, this.CLIPPINGS_JSON_FILENAME);
          }
          else {
            let dirProp = Services.dirsvc;
	    let profileDir = dirProp.get("ProfD", Components.interfaces.nsIFile);
	    let path = profileDir.path;
            jsonFilePath = OS.Path.join(path, this.CLIPPINGS_JSON_FILENAME);
          }

          try {
	    rv = await OS.File.read(jsonFilePath, { encoding: "utf-8" });
	  }
	  catch (e) {
            rv = null;
          }

	  return rv;
	},

	// Helper method
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
