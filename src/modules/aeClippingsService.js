/* -*- mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["aeClippingsService"];


ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://clippings/modules/aeUtils.js");

const Cc = Components.classes;
const Ci = Components.interfaces;


let aeClippingsService = {
  getService()
  {
    let rv = Cc["clippings@mozdev.org/clippings;1"].getService(Ci.aeIClippingsService);
    return rv;
  }
};


//
// Private helper functions
//

function _log(aMessage)
{
  if (aeUtils.DEBUG) {
    var consoleSvc = Services.prefs.console;
    consoleSvc.logStringMessage("aeClippingsService.js:" + aMessage);
  }
}
