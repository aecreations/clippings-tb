/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {aeUtils} = ChromeUtils.import("resource://clippings/modules/aeUtils.js");

const EXPORTED_SYMBOLS = ["aeClippingSubst"];


/*
 * Module aeClippingSubst
 * Performs substitution of variables embedded inside a clipping with either
 * predefined values or user-input text.
 */
var aeClippingSubst = {
  _localeData: null,
  _userAgentStr: null,
  _autoIncrementVars: {}
};


aeClippingSubst.init = function (aLocaleData, aUserAgentStr)
{
  this._localeData = aLocaleData;
  this._userAgentStr = aUserAgentStr;
};


/*
 * Factory method
 * Returns an object that holds various properties of a clipping to be passed
 * as an argument to aeClippingSubst.processClippingText()
 */
aeClippingSubst.getClippingInfo = function (aURI, aName, aText, aParentFolderName)
{
  var rv = {
    uri  : aURI,
    name : aName,
    text : aText,
    parentFolderName: aParentFolderName
  };

  return rv;
};


aeClippingSubst.processClippingText = function (aClippingInfo, aWnd, aAutoIncrPlchldrStartVal)
{
  if ((/^\[NOSUBST\]/.test(aClippingInfo.name))) {
    return aClippingInfo.text;
  }

  var rv = "";
  var userAgentStr = this._userAgentStr;
  var hasFmtDateTime = false;

  // Remember the value of the same placeholder that was filled in previously
  var knownTags = {};

  let fnReplace = (aMatch, aP1, aP2, aOffset, aString) => {
    let varName = aP1;

    if (varName in knownTags) {
      return knownTags[varName];
    }

    let hasDefaultVal = false;
    let hasMultipleVals = false;

    if (aP2) {
      hasDefaultVal = true;

      if (aP2.indexOf("|") != -1) {
        hasMultipleVals = true;
      }
    }

    // Pre-populate input with default value, if any.
    let defaultVal = "";
    if (hasDefaultVal) {
      defaultVal = aP2.substring(aP2.indexOf("{") + 1, aP2.indexOf("}"));

      let date = new Date();

      switch (defaultVal) {
      case "_DATE_":
        defaultVal = date.toLocaleDateString();
        break;

      case "_TIME_":
        defaultVal = date.toLocaleTimeString();
        break;

      case "_NAME_":
        defaultVal = aClippingInfo.name;
        break;

      case "_FOLDER_":
        defaultVal = aClippingInfo.parentFolderName;
        break;

      case "_HOSTAPP_":
        defaultVal = aeUtils.getHostAppName();
        break;

      case "_UA_":
        defaultVal = userAgentStr;
        break;
        
      default:
        break;
      }
    }

    var rv = "";   
    var dlgArgs = {
      varName:       varName,
      userInput:     "",
      defaultValue:  defaultVal,
      autoIncrementMode: false,
      selectMode:    hasMultipleVals,
      userCancel:    null,
      localeData:    this._localeData,
    };
    dlgArgs.wrappedJSObject = dlgArgs;

    this._openDialog(aWnd, "chrome://clippings/content/placeholderPrompt.xhtml", "ae_placeholder_prmpt", "modal,centerscreen", dlgArgs);
    if (dlgArgs.userCancel || dlgArgs.userInput == "") {
      return "";
    }

    knownTags[varName] = dlgArgs.userInput;
    rv = dlgArgs.userInput;

    return rv;
  };

  let fnAutoIncrement = (aMatch, aP1) => {
    let rv;
    let varName = aP1;

    if (varName in this._autoIncrementVars) {
      rv = ++this._autoIncrementVars[varName];
    }
    else {
      rv = this._autoIncrementVars[varName] = aAutoIncrPlchldrStartVal;
    }

    return rv;
  };

  let date = new Date();

  hasFmtDateTime = (aClippingInfo.text.search(/\$\[DATE\(([AaDdHhKkMmosYLlTZ ,.:\-\/]+)\)\]/) != -1 || aClippingInfo.text.search(/\$\[TIME\(([AaHhKkmsLTZ .:]+)\)\]/) != -1);

  rv = aClippingInfo.text.replace(/\$\[DATE\]/gm, date.toLocaleDateString());
  rv = rv.replace(/\$\[TIME\]/gm, date.toLocaleTimeString());
  rv = rv.replace(/\$\[NAME\]/gm, aClippingInfo.name);
  rv = rv.replace(/\$\[FOLDER\]/gm, aClippingInfo.parentFolderName);
  rv = rv.replace(/\$\[HOSTAPP\]/gm, aeUtils.getHostAppName() + " " + aeUtils.getHostAppVersion());
  rv = rv.replace(/\$\[UA\]/gm, userAgentStr);

  // Match placeholder names containing alphanumeric char's, underscores, and
  // the following Unicode blocks: Latin-1 Supplement, Latin Extended-A, Latin
  // Extended-B, Cyrillic, Hebrew.
  // For normal placeholders, allow {|} chars for optional default values, and
  // within the { and }, allow the same characters as placeholder names, but
  // including the space, hyphen, period, parentheses, common currency symbols,
  // and the following special characters: ?_/!@#%&;,:'"
  rv = rv.replace(/\$\[([\w\u0080-\u00FF\u0100-\u017F\u0180-\u024F\u0400-\u04FF\u0590-\u05FF]+)(\{([\w \-\.\?_\/\(\)!@#%&;:,'"$£¥€*¡¢\u0080-\u00FF\u0100-\u017F\u0180-\u024F\u0400-\u04FF\u0590-\u05FF\|])+\})?\]/gm, fnReplace);
  rv = rv.replace(/\#\[([a-zA-Z0-9_\u0080-\u00FF\u0100-\u017F\u0180-\u024F\u0400-\u04FF\u0590-\u05FF]+)\]/gm, fnAutoIncrement);

  if (hasFmtDateTime) {
    let dlgArgs = {
      dtPlaceholders: [],
      dtReplaced: [],
      plchldrType: [],
    };

    let fmtDateRe = /\$\[DATE\(([AaDdHhKkMmosYLlTZ ,.:\-\/]+)\)\]/g;
    let fmtDateResult;
    while ((fmtDateResult = fmtDateRe.exec(aClippingInfo.text)) != null) {
      dlgArgs.dtPlaceholders.push(fmtDateResult[1]);
      dlgArgs.plchldrType.push("D");
    }

    let fmtTimeRe = /\$\[TIME\(([AaHhKkmsLTZ .:]+)\)\]/g;
    let fmtTimeResult;
    while ((fmtTimeResult = fmtTimeRe.exec(aClippingInfo.text)) != null) {
      dlgArgs.dtPlaceholders.push(fmtTimeResult[1]);
      dlgArgs.plchldrType.push("T");
    }

    aWnd.openDialog("chrome://clippings/content/processDateTimePlaceholder.xhtml", "ae_clippings_dtplchldrs", "chrome,modal,centerscreen", dlgArgs, this._localeData);

    for (let i = 0; i < dlgArgs.dtPlaceholders.length; i++) {
      let prefix = "";
      if (dlgArgs.plchldrType[i] == "D") {
	prefix = "$[DATE(";
      }
      else if (dlgArgs.plchldrType[i] == "T"){
	prefix = "$[TIME(";
      }
      let dtPlchldr = prefix + dlgArgs.dtPlaceholders[i] + ")]";
      rv = rv.replace(dtPlchldr, dlgArgs.dtReplaced[i]);
    }
  }

  return rv;
};


aeClippingSubst._openDialog = function (aParentWnd, aDialogURL, aName, aFeatures, aParams)
{
  if (aeUtils.getOS() == "Darwin") {
    var dlgFeatures = aFeatures + ",dialog=yes,resizable=no";
    Services.ww.openWindow(null, aDialogURL, aName, dlgFeatures, aParams);
  }
  else {
    aParentWnd.openDialog(aDialogURL, aName, aFeatures, aParams);
  }
};


aeClippingSubst.getAutoIncrementVarNames = function ()
{
  var rv = [];
  for (var name in this._autoIncrementVars) {
    rv.push(name);
  }
  return rv;
};


aeClippingSubst.resetAutoIncrementVar = function (aVarName)
{
  delete this._autoIncrementVars[aVarName];
};
