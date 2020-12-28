/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


class aeListeners
{
  constructor()
  {
    this._listeners = new Set();
  }

  add(aNewListener)
  {
    this._listeners.add(aNewListener);
  }

  remove(aTargetListener)
  {
    this._listeners.delete(aTargetListener);
  }

  getListeners()
  {
    let rv = Array.from(this._listeners);
    return rv;
  }
}
