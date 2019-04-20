/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");


const EXPORTED_SYMBOLS = ["aePackagedClippings"];


//
// Packaged data source library
//

var aePackagedClippings = {
  PACKAGED_DS_FILENAME: "clippak.rdf",
  PACKAGED_DS_DIRNAME:  "defaults",

  // Exceptions
  E_CLIPPINGSSVC_NOT_INITIALIZED: "aeIClippingsService not initialized",
  E_IMPORT_FAILED: "Import of packaged datasource failed",
  E_FLUSH_FAILED:  "Flush after import of packaged datasource failed",

  _extInstallDir: null
};


/*
 * Module initializer - must be invoked before any other methods
 */
aePackagedClippings.init = function (aExtensionInstallDirURIStr)
{
  var io = Components.classes["@mozilla.org/network/io-service;1"]
                     .getService(Components.interfaces.nsIIOService);
  var fh = io.getProtocolHandler("file")
             .QueryInterface(Components.interfaces.nsIFileProtocolHandler);
  this._extInstallDir = fh.getFileFromURLSpec(aExtensionInstallDirURIStr);
};


/*
 * Returns true if there is a packaged datasource file, false otherwise.
 */
aePackagedClippings.exists = function ()
{
  return (this._getPackagedDataSrcFile() !== null);
};


aePackagedClippings._getPackagedDataSrcFile = function ()
{
  var rv = null;
  let pdsDir = this._extInstallDir.clone();
  pdsDir.append(this.PACKAGED_DS_DIRNAME);

  if (pdsDir.exists() && pdsDir.isDirectory()) {
    let pdsFile = pdsDir.clone();
    pdsFile.append(this.PACKAGED_DS_FILENAME);
    if (pdsFile.exists() && pdsFile.isFile()) {
      rv = pdsFile;
    }
  }

  return rv;
};


/*
 * Import the packaged clippings data into the Clippings data source
 */
aePackagedClippings.importData = function (aClippingsSvc)
{
  if (! aClippingsSvc) {
    throw this.E_CLIPPINGSSVC_NOT_INITIALIZED;
  }

  var pkgDataSrcFile = this._getPackagedDataSrcFile();
  var fph = Components.classes["@mozilla.org/network/protocol;1?name=file"].createInstance(Components.interfaces.nsIFileProtocolHandler); 
  var pkgDataSrcURL = fph.getURLSpecFromFile(pkgDataSrcFile);
  var numImported = -1;
  var importShortcutKeys = true;

  aeUtils.log(`URL of the packaged data source file to import: ${pkgDataSrcURL}`);

  try {
    numImported = aClippingsSvc.importFromFile(pkgDataSrcURL, true, importShortcutKeys, {});
  }
  catch (e) {
    aeUtils.log(`aePackagedClippings.importData(): Exception thrown by aeClippingsService.importFromFile():\n\n${e}`);
    throw this.E_IMPORT_FAILED;
  }

  if (numImported != -1) {
    aeUtils.log(`Successfully imported the packaged data into the Clippings data source\n${numImported} item(s) imported`);
    
    try {
      aClippingsSvc.flushDataSrc(true, false);
    }
    catch (e) {
      aeUtils.log(`aePackagedClippings.importData(): Exception thrown by aeClippingsService.flushDataSrc():\n\n${e}`);
      throw this.E_FLUSH_FAILED;
    }
  }
};

