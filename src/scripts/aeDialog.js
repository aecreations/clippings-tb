/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


class aeDialog
{
  constructor(aDlgEltSelector)
  {
    this.HIDE_POPUP_DELAY_MS = 5000;
    
    this._dlgEltStor = aDlgEltSelector;
    this._isInitialized = false;
    this._fnFirstInit = function () {};
    this._fnInit = function () {};
    this._fnDlgShow = function () {};
    this._fnUnload = function () {};
    this._fnAfterDlgAccept = function () {};
    this._popupTimerID = null;

    this._fnDlgAccept = function (aEvent) {
      if (this.isPopup()) {
        this.hidePopup();
      }
      else {
        this.close();
      }
    };
    
    this._fnDlgCancel = function (aEvent) {
      if (this.isPopup()) {
        this.hidePopup();
      }
      else {
        this.close();
      }
    };

    this._init();
  }

  _init()
  {
    let dlgAcceptElt = $(`${this._dlgEltStor} > .dlg-btns > .dlg-accept`);
    if (dlgAcceptElt.length > 0) {
      dlgAcceptElt.click(aEvent => {
        if (aEvent.target.disabled) {
          return;
        }
        this._fnDlgAccept(aEvent);
        this._fnAfterDlgAccept();
      });
    }

    let dlgCancelElt = $(`${this._dlgEltStor} > .dlg-btns > .dlg-cancel`);
    if (dlgCancelElt.length > 0) {
      dlgCancelElt.click(aEvent => {
        if (aEvent.target.disabled) {
          return;
        }
        this._fnDlgCancel(aEvent);
      });
    }
  }
  
  set onInit(aFnInit)
  {
    this._fnInit = aFnInit;
  }

  set onFirstInit(aFnInit)
  {
    this._fnFirstInit = aFnInit;
  }

  set onUnload(aFnUnload)
  {
    this._fnUnload = aFnUnload;
  }

  set onShow(aFnShow)
  {
    this._fnDlgShow = aFnShow;
  }
  
  set onAfterAccept(aFnAfterAccept)
  {
    this._fnAfterDlgAccept = aFnAfterAccept;
  }
  
  set onAccept(aFnAccept)
  {
    this._fnDlgAccept = aFnAccept;
  }

  set onCancel(aFnCancel)
  {
    this._fnDlgCancel = aFnCancel;    
  }

  setProps(aProperties)
  {
    for (let prop in aProperties) {
      this[prop] = aProperties[prop];
    }
  }

  isPopup()
  {
    let rv = $(this._dlgEltStor).hasClass("panel");
    return rv;
  }

  showModal()
  {
    if (! this._isInitialized) {
      this._fnFirstInit();
      this._isInitialized = true;
    }
    
    this._fnInit();
    $("#lightbox-bkgrd-ovl").addClass("lightbox-show");
    $(`${this._dlgEltStor}`).addClass("lightbox-show");
    this._fnDlgShow();
  }

  close()
  {
    this._fnUnload();
    $(`${this._dlgEltStor}`).removeClass("lightbox-show");
    $("#lightbox-bkgrd-ovl").removeClass("lightbox-show");
  }

  openPopup()
  {
    if (this._popupTimerID) {
      window.clearTimeout(this._popupTimerID);
      this._popupTimerID = null;
    }

    this._fnInit();

    let popupElt = $(`${this._dlgEltStor}`);
    $("#panel-bkgrd-ovl").addClass("panel-show");
    popupElt.addClass("panel-show");

    // Auto-close after a few second's delay.
    this._popupTimerID = window.setTimeout(() => {
      this.hidePopup();
    }, this.HIDE_POPUP_DELAY_MS);
  }

  hidePopup()
  {
    let popupElt = $(`${this._dlgEltStor}`);

    if (popupElt.hasClass("panel-show")) {
      this._fnUnload();
      popupElt.removeClass("panel-show");
      $("#panel-bkgrd-ovl").removeClass("panel-show");

      window.clearTimeout(this._popupTimerID);
      this._popupTimerID = null;
    }
  }

  isAcceptOnly()
  {
    let dlgAcceptElt = $(`${this._dlgEltStor} > .dlg-btns > .dlg-accept`);
    let dlgCancelElt = $(`${this._dlgEltStor} > .dlg-btns > .dlg-cancel`);
    
    return (dlgCancelElt.length == 0 && dlgAcceptElt.length > 0);
  }
  
  static isOpen()
  {
    return ($(".lightbox-show").length > 0);
  }
  
  static acceptDlgs()
  {
    let openDlgElts = $(".lightbox-show");

    if (openDlgElts.length > 0) {
      // Normally there should just be 1 dialog open at a time.
      $(".lightbox-show .dlg-accept:not(:disabled)").click();
    }

    this.hidePopups();
  }

  static cancelDlgs()
  {
    let openDlgElts = $(".lightbox-show");

    if (openDlgElts.length > 0) {
      // Normally there should just be 1 dialog open at a time.
      let cancelBtnElt = $(".lightbox-show .dlg-cancel:not(:disabled)");
      if (cancelBtnElt.length > 0) {
        cancelBtnElt.click();
      }
      else {
        // Dialog only has an OK, Close or Done button.
        $(".lightbox-show .dlg-accept").click();
      }
    }

    this.hidePopups();
  }

  static hidePopups()
  {
    let openPopupPanelElts = $(".panel");

    if (openPopupPanelElts.length > 0) {
      $(".panel").removeClass("panel-show");
      $("#panel-bkgrd-ovl").removeClass("panel-show");
    }
  }
}
