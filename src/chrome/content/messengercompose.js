/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let {aeConstants} = ChromeUtils.import("resource://clippings/modules/aeConstants.js");
let {aeString} = ChromeUtils.import("resource://clippings/modules/aeString.js");
let {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");

Services.scriptloader.loadSubScript("chrome://clippings/content/tbMsgComposeOverlay.js", window, "UTF-8");


let gClippingsMxListener = {
  _clippings: WL.messenger.extension.getBackgroundPage(),
  _cxtMenuData: null,

  newClippingDlgRequested(aClippingContent)
  {
    if (! aClippingContent) {
      return;
    }

    this._clippings.openNewClippingDlg(aClippingContent);
  },

  async clippingsDataRequested()
  {
    let rv;

    if (!this._cxtMenuData || this._clippings.isDirty()) {
      rv = this._cxtMenuData = await this._clippings.getContextMenuData();
    }
    else {
      rv = this._cxtMenuData;
    }

    return rv;
  }
};


function onLoad(aActivatedWhileWindowOpen)
{
  aeUtils.log("Clippings/mx::messengercompose.js: Initializing integration with message compose window.");
  
  let strBundle = aeUtils.getStringBundle("chrome://clippings/locale/clippings.properties");

  // TO DO: Avoid hard-coding UI strings.
  WL.injectElements(`
  <commandset id="composeCommands">
    <command id="ae_clippings_manager" 
     oncommand="window.aecreations.clippings.util.aeUtils.alertEx('Organize Clippings', '${WL.messenger.i18n.getMessage('msgUnavail')}')"/>
    <command id="ae_new_clipping_from_clpbd" 
     oncommand="window.aecreations.clippings.util.aeUtils.alertEx('New From Clipboard', '${WL.messenger.i18n.getMessage('msgUnavail')}')"/>
    <command id="ae_new_clipping_from_selection"
     oncommand="window.aecreations.clippings.newFromSelection()"/>
    <command id="ae_clippings_show_paste_options" 
     oncommand="window.aecreations.clippings.util.aeUtils.alertEx('Show Quote Options', '${WL.messenger.i18n.getMessage('msgUnavail')}')"/>
    <command id="ae_clippings_keyboard_insert" label="Paste Clipping"
     oncommand="window.aecreations.clippings.util.aeUtils.alertEx('Paste Clipping', '${WL.messenger.i18n.getMessage('msgUnavail')}')"/>
  </commandset>

  <keyset id="tasksKeys">
    <key id="key_ae_clippings" key="v"
     modifiers="alt control" command="ae_clippings_keyboard_insert"/>
    <key id="key_ae_clippings_new" key="y"
     modifiers="alt shift" command="ae_clippings_keyboard_insert"/>
    
    <!-- For Mac OS X -->
    <key id="key_ae_clippings_mac" key="v"
     modifiers="alt meta" command="ae_clippings_keyboard_insert"/>
    <key id="key_ae_clippings_new_mac" key="y"
     modifiers="meta shift" command="ae_clippings_keyboard_insert"/>
  </keyset>

  <menupopup id="msgComposeContext">
    <menu id="ae-clippings-menu-1" label="Clippings">
      <menupopup id="ae-clippings-popup-1">
        <menuitem id="ae-clippings-add" label="New From Selection..." accesskey="N" command="ae_new_clipping_from_selection"/>
        <menuitem label="Organize Clippings" accesskey="O" command="ae_clippings_manager"/>
	<menuseparator id="reset-auto-increment-vars-separator"/>
        <menu id="reset-auto-increment-vars" label="Reset Auto-increment Placeholders">
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
        <description>Clipboard is empty or does not contain textual data.</description>
      </hbox>
      <hbox>
	<spacer flex="1"/>
        <button label="OK" oncommand="this.parentNode.parentNode.hidePopup()"/>
	<spacer flex="1"/>
      </hbox>
    </panel>

    <!-- Thunderbird status bar menu -->
    <menupopup id="ae-clippings-popup" 
     onpopupshowing="window.aecreations.clippings.initToolbarBtnCxtMenu(event)">
      <menuitem label="Organize Clippings" 
       accesskey="O"  default="true" 
       command="ae_clippings_manager"/>
      <menuitem id="ae-clippings-new-from-clipbd"
       label="New From Clipboard..." 
       accesskey="N" 
       command="ae_new_clipping_from_clpbd" />
      <menuseparator/>
      <menuitem id="ae-clippings-show-paste-opts"
       type="checkbox" checked="false" label="Show Quote Options When Pasting"
       accesskey="S"
       command="ae_clippings_show_paste_options" />
    </menupopup>
  </popupset>
  `);
  
  WL.injectCSS("chrome://clippings/content/style/overlay.css");

  // Initialize status bar icon.
  let statusBar = document.getElementById("status-bar");
  let statusbarpanel = document.createXULElement("hbox");
  statusbarpanel.id = "ae-clippings-statubarpanel";
  let statusbarBtn = document.createXULElement("toolbarbutton");
  statusbarBtn.id = "ae-clippings-icon";
  statusbarBtn.setAttribute("context", "ae-clippings-popup");
  statusbarBtn.setAttribute("tooltiptext", strBundle.getString("appName"));

  statusbarBtn.addEventListener("command", aEvent => {
    window.aecreations.clippings.openClippingsManager();
  });

  statusbarpanel.appendChild(statusbarBtn);
  statusBar.insertBefore(statusbarpanel, statusBar.lastChild);

  window.aecreations.clippings.addMxListener(gClippingsMxListener);
  window.aecreations.clippings.initClippings();
}


function onUnload(aDeactivatedWhileWindowOpen)
{
  // Cleaning up the window UI is only needed when the
  // add-on is being deactivated/removed while the window
  // is still open. It can be skipped otherwise.
  if (! aDeactivatedWhileWindowOpen) {
    return;
  }

  window.aecreations.clippings.removeMxListener();
  window.aecreations.clippings.unload();
}


