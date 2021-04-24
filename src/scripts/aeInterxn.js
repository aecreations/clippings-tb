/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


let aeInterxn = {

  getTooltipOpts()
  {
    let rv = {
      position: { my: "left top+6", at: "left bottom", collision: "flipfit" },
      show: { delay: 700, duration: 200 },
      hide: { duration: 30 },
    };

    return rv;
  }
};
