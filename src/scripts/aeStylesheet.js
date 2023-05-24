/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let aeStylesheet = {
  load(aURL)
  {
    return new Promise(function (aFnResolve, aFnReject) {
      let link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = aURL;

      link.onload = () => aFnResolve(link);
      link.onerror = () => aFnReject(new Error(`Failed to load style sheet ${aURL}`));

      document.head.append(link);
    });
  }
};
