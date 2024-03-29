/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


let aeWndPos = function () {
  let TOP_OFFSET = 200;
  
  async function _getComposerWndGeom()
  {
    let rv = null;
    let msgrTabs = await messenger.tabs.query({});
    
    for (let tab of msgrTabs) {
      let wnd = await messenger.windows.get(tab.windowId);
      if (wnd.type == "messageCompose" && wnd.focused) {
	let wndGeom = {
          w: wnd.width,
          h: wnd.height,
          x: wnd.left,
          y: wnd.top,
	};
	rv = wndGeom;
	break;
      }
    }

    return rv;
  };

  async function _getFocusedWndGeom()
  {
    let rv = null;
    let msgrWnds = await messenger.windows.getAll();

    for (let wnd of msgrWnds) {
      if (["normal", "messageCompose"].includes(wnd.type) && wnd.focused) {
	let wndGeom = {
          w: wnd.width,
          h: wnd.height,
          x: wnd.left,
          y: wnd.top,
	};
	rv = wndGeom;
	break;
      }
    }

    return rv;
  };

  return {
    WND_CURRENTLY_FOCUSED: 0,
    WND_MESSENGER: 1,
    WND_MSG_COMPOSE: 2,
    
    async calcPopupWndCoords(aWidth, aHeight, aTopOffset, aWndType)
    {
      let rv = null;

      let wndGeom;
      if (aWndType == this.WND_MSG_COMPOSE) {
	wndGeom = await _getComposerWndGeom();
      }
      else {
	wndGeom = await _getFocusedWndGeom();
      }
      
      let topOffset = aTopOffset ?? TOP_OFFSET;
      let left, top;

      if (wndGeom) {
        if (wndGeom.w < aWidth) {
          left = null;
        }
        else {
          left = Math.ceil((wndGeom.w - aWidth) / 2) + wndGeom.x;
        }

        if ((wndGeom.h + topOffset) < aHeight) {
          top = null;
        }
        else {
          top = wndGeom.y + topOffset;
        }

	rv = { left, top };
      }
      else {
	rv = {
	  left: 62,
	  top: 128,
	};
      }
      
      return rv;
    }
  }
}();
