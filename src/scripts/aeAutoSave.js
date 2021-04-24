/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class aeAutoSave
{
  static DEFAULT_SAVE_INTV_MS = 3000;
  
  constructor(aInputDOMElt, aSaveInterval)
  {
    this._inputElt = aInputDOMElt;
    this._saveInterval = aSaveInterval || aeAutoSave.DEFAULT_SAVE_INTV_MS;
    this._saveIntvID = null;
    this._fnSave = () => {};
    this._oldContent = null;
    this._debug = false;
  }

  set debug(aIsDebugLoggingOn)
  {
    this._debug = aIsDebugLoggingOn;
  }
  
  set onSave(aFnSave)
  {
    this._fnSave = aFnSave;
  }

  start()
  {
    this._log(`aeAutoSave.js: (Input element: '#${this._inputElt.id}')::start(): Starting auto-save microthread`);
    this._oldContent = this._inputElt.value;
    
    this._saveIntvID = window.setInterval(() => {
      let content = this._inputElt.value;
      if (content != this._oldContent) {
	this._log(`aeAutoSave.js: (Input element: '#${this._inputElt.id}')::[Interval ID: ${this._saveIntvID}] Auto-saving content from textbox:\n> ${content}`);
	this._fnSave(content);
	this._oldContent = content;
      }
    }, this._saveInterval);
  }

  stop(aKeepSaveCallback = false)
  {
    this._log(`aeAutoSave.js: (Input element: '#${this._inputElt.id}')::stop(): Stopping auto-save microthread; aKeepSaveCallback = ${aKeepSaveCallback}`);

    window.clearInterval(this._saveIntvID);

    this._saveIntvID = null;
    this._oldContent = null;

    if (! aKeepSaveCallback) {
      this._fnSave = () => {};
    }
  }

  _log(aMsg)
  {
    if (this._debug) {
      console.log(aMsg);
    }
  }
}
