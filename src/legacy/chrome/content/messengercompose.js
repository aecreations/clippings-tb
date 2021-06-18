/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");

Services.scriptloader.loadSubScript("chrome://clippings/content/tbMsgComposeOverlay.js",
				    window, "UTF-8");
Services.scriptloader.loadSubScript("chrome://clippings/content/lib/notifyTools.js",
				    this, "UTF-8");


let gClippingsMxListener = function () {
  let _clippings = WL.messenger.extension.getBackgroundPage();
  let _cxtMenuData = null;

  return {
    async prefsRequested()
    {
      let rv = await notifyTools.notifyBackground({command: "get-prefs"});
      return rv;
    },

    async prefsChanged(aPrefs)
    {
      await notifyTools.notifyBackground({
	command: "set-prefs",
	prefs: aPrefs,
      });
    },
    
    newClippingDlgOpened(aClippingContent)
    {
      if (! aClippingContent) {
	return;
      }

      _clippings.openNewClippingDlg(aClippingContent);
    },

    clippingsManagerWndOpened()
    {
      notifyTools.notifyBackground({command: "open-clippings-mgr"});
    },

    async clippingsMenuDataRequested(aRootFldrID)
    {
      let rv;

      if (!_cxtMenuData || _clippings.isDirty()) {
	rv = _cxtMenuData = await _clippings.getContextMenuData(aRootFldrID);
      }
      else {
	rv = _cxtMenuData;
      }

      return rv;
    },

    async clippingRequested(aClippingID)
    {
      let rv = await _clippings.getClipping(aClippingID);

      return rv;
    },

    async shortcutKeyMapRequested()
    {
      let rv = await _clippings.getShortcutKeyMap();

      return rv;
    },

    async clippingSearchDataRequested()
    {
      let rv = await _clippings.getClippingSearchData();

      return rv;
    }
  };
}();


async function onLoad(aActivatedWhileWindowOpen)
{
  WL.injectElements(`
  <commandset id="composeCommands">
    <command id="ae_clippings_manager" 
     oncommand="window.aecreations.clippings.openClippingsManager()"/>
    <command id="ae_new_clipping_from_clpbd" 
     oncommand="window.aecreations.clippings.newFromClipboard()"/>
    <command id="ae_new_clipping_from_selection"
     oncommand="window.aecreations.clippings.newFromSelection()"/>
    <command id="ae_clippings_show_paste_options" 
     oncommand="window.aecreations.clippings.toggleShowPasteOptions()"/>
    <command id="ae_clippings_keyboard_insert" label="__MSG_cmdDesc__"
     oncommand="window.aecreations.clippings.keyboardInsertClipping()"/>
  </commandset>

  <keyset id="tasksKeys">
    <key id="key_ae_clippings" key="v"
     modifiers="alt control" command="ae_clippings_keyboard_insert"/>
    <key id="key_ae_clippings_new" key="y"
     modifiers="alt shift" command="ae_clippings_keyboard_insert"/>
    
    <!-- For macOS -->
    <key id="key_ae_clippings_mac" key="v"
     modifiers="alt meta" command="ae_clippings_keyboard_insert"/>
  </keyset>

  <menupopup id="msgComposeContext">
    <menu id="ae-clippings-menu-1" label="__MSG_browserActionTitle__">
      <menupopup id="ae-clippings-popup-1">
        <menuitem id="ae-clippings-add" label="__MSG_cxtMenuNewFromSel__" command="ae_new_clipping_from_selection"/>
        <menuitem label="__MSG_cxtMenuOpenClippingsMgr__" command="ae_clippings_manager"/>
	<menuseparator id="reset-auto-increment-vars-separator"/>
        <menu id="reset-auto-increment-vars" label="__MSG_baMenuResetAutoIncrPlaceholders__">
          <menupopup id="reset-auto-increment-vars-menu-popup"></menupopup>
        </menu>
        <menuseparator/>
      </menupopup>
    </menu>
  </menupopup>

  <popupset>
    <!-- Dialog panel for alert when attempting to create new clipping from
         clipboard, and clipboard doesn't contain any text. -->
    <panel id="ae-clippings-clipboard-alert" orient="vertical">
      <hbox align="center">
	<image class="alert-icon" />
        <description>__MSG_msgClipbdEmpty__</description>
      </hbox>
      <hbox>
	<spacer flex="1"/>
        <button label="__MSG_btnOK__" oncommand="this.parentNode.parentNode.hidePopup()"/>
	<spacer flex="1"/>
      </hbox>
    </panel>

    <!-- Thunderbird status bar menu -->
    <menupopup id="ae-clippings-popup">
      <menuitem label="__MSG_cxtMenuOpenClippingsMgr__" default="true" 
       command="ae_clippings_manager"/>
      <menuitem id="ae-clippings-new-from-clipbd"
       label="__MSG_cxtMenuNewFromClipbd__" 
       command="ae_new_clipping_from_clpbd" />
      <menuseparator/>
      <menuitem id="ae-clippings-show-paste-opts"
       type="checkbox" checked="false" label="__MSG_cxtMenuShowPasteOpts__"
       command="ae_clippings_show_paste_options" />
    </menupopup>
  </popupset>
  `);
  
  WL.injectCSS("chrome://clippings/content/style/overlay.css");

  // Initialize status bar icon.
  let statusBar = document.getElementById("status-bar");
  let statusbarpanel = document.createXULElement("hbox");
  statusbarpanel.id = "ae-clippings-status";
  let statusbarBtn = document.createXULElement("toolbarbutton");
  statusbarBtn.id = "ae-clippings-icon";
  statusbarBtn.setAttribute("context", "ae-clippings-popup");
  statusbarBtn.setAttribute("tooltiptext", WL.extension.localeData.localizeMessage("browserActionTitle"));

  statusbarBtn.addEventListener("command", aEvent => {
    window.aecreations.clippings.openClippingsManager();
  });

  statusbarpanel.appendChild(statusbarBtn);
  statusBar.insertBefore(statusbarpanel, statusBar.lastChild);

  window.aecreations.clippings.addMxListener(gClippingsMxListener);
  window.aecreations.clippings.initClippings(WL.extension);
}


function onUnload(aDeactivatedWhileWindowOpen)
{
  // Cleaning up the window UI is only needed when the
  // add-on is being deactivated/removed while the window
  // is still open. It can be skipped otherwise.
  if (! aDeactivatedWhileWindowOpen) {
    return;
  }

  let statusbarpanel = document.getElementById("ae-clippings-status");
  statusbarpanel.parentNode.removeChild(statusbarpanel);
  
  window.aecreations.clippings.removeMxListener();

  delete window.aecreations.clippings;
  if (Object.keys(window.aecreations).length == 0) {
    delete window.aecreations;
  }
}


