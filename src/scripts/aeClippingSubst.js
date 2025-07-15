/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


/*
 * Module aeClippingSubst
 * Performs substitution of variables embedded inside a clipping with either
 * predefined values or user-input text.
 */
let aeClippingSubst = {
  // Match placeholder names containing alphanumeric char's, underscores, and
  // the following Unicode blocks: Latin-1 Supplement, Latin Extended-A, Latin
  // Extended-B, Cyrillic, Hebrew.
  // For normal placeholders, allow {|} chars for optional default values, and
  // within the { and }, allow the same characters as placeholder names, but
  // including the space, hyphen, period, parentheses, common currency symbols,
  // and the following special characters: ?_/!@#%&;,:'"
  // Optional default values also supports all Unicode characters.
  REGEXP_CUSTOM_PLACEHOLDER: /\$\[([\w\u0080-\u00FF\u0100-\u017F\u0180-\u024F\u0400-\u04FF\u0590-\u05FF]+)(\{([\w \-\.\?_\/\(\)!@#%&;:,'"$£¥€*¡¢\u{0080}-\u{10FFFF}\|])+\})?\]/gmu,

  REGEXP_AUTO_INCR_PLACEHOLDER: /\#\[([a-zA-Z0-9_\u0080-\u00FF\u0100-\u017F\u0180-\u024F\u0400-\u04FF\u0590-\u05FF]+)\]/gm,
  
  // Formatted date/time placeholders using formats from Moment library.
  REGEXP_DATE: /\$\[DATE\(([AaDdHhKkMmosYLlTZ ,.:\-\/]+)\)\]/,
  REGEXP_TIME: /\$\[TIME\(([AaHhKkmsLTZ .:]+)\)\]/,

  // Name of clipping can be alphanumeric char's, underscores, and
  // the following Unicode blocks: Latin-1 Supplement, Latin Extended-A, Latin
  // Extended-B, Cyrillic, Hebrew, as well as the space, hyphen, period,
  // parentheses, common currency symbols, all Unicode characters, and the
  // following special characters: ?_/!@#%&;,:'"
  REGEXP_CLIPPING: /\$\[CLIPPING\((([\w\d\s\.\-_!@#%&;:,'"$£¥€*¡¢\u0080-\u00FF\u0100-\u017F\u0180-\u024F\u0400-\u04FF\u0590-\u05FF\u0080-\u10FFFF])+)\)\]/,
  
  _userAgentStr: null,
  _hostAppName: null,
  _autoIncrementVars: {},
  _autoIncrementStartVal: 0,
  _failedPlchldrs: [],
};


aeClippingSubst.init = async function (aUserAgentStr, aAutoIncrementStartVal)
{
  if (!! this._userAgentStr) {
    return;
  }

  this._userAgentStr = aUserAgentStr;
  this._autoIncrementStartVal = aAutoIncrementStartVal;

  let brws = await messenger.runtime.getBrowserInfo();
  this._hostAppName = `${brws.name} ${brws.version}`;

  // Initialize locale used for formatting dates.
  moment.locale(messenger.i18n.getUILanguage());
};


aeClippingSubst.setAutoIncrementStartValue = function (aValue)
{
  this._autoIncrementStartVal = aValue;
};


aeClippingSubst.hasNoSubstFlag = function (aClippingName) {
  return (/^\[NOSUBST\]/.test(aClippingName));
};


aeClippingSubst.getCustomPlaceholders = function (aClippingText)
{
  let rv = [];
  let plchldrs = [];

  let re = this.REGEXP_CUSTOM_PLACEHOLDER;

  let result;
  
  while ((result = re.exec(aClippingText)) != null) {
    plchldrs.push(result[1]);
  }

  rv = plchldrs;
  return rv;
};


aeClippingSubst.getCustomPlaceholderDefaultVals = function (aClippingText, aClippingInfo)
{
  let rv = {};
  let re = this.REGEXP_CUSTOM_PLACEHOLDER;

  let result;
  
  while ((result = re.exec(aClippingText)) != null) {
    let plchldrName = result[1];
    
    if (result[2]) {
      let defVal = result[2];
      let defaultVal = defVal.substring(defVal.indexOf("{") + 1, defVal.indexOf("}"));
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
        defaultVal = this._hostAppName;
        break;
        
      case "_UA_":
        defaultVal = this._userAgentStr;
        break;
        
      default:
        break;
      }

      rv[plchldrName] = defaultVal;
    }
  }
  
  return rv;
};


aeClippingSubst.getAutoIncrPlaceholders = function (aClippingText)
{
  let rv = [];
  let re = this.REGEXP_AUTO_INCR_PLACEHOLDER;

  let result;

  while ((result = re.exec(aClippingText)) != null) {
    rv.push(result[1]);
  }

  return rv;
};


aeClippingSubst.processStdPlaceholders = async function (aClippingInfo, aComposeDetails)
{
  let rv = "";
  let processedTxt = "";  // Contains expanded clipping in clipping placeholders.
  let clipInClipMatches = [];
  let clipInClipRe = new RegExp(this.REGEXP_CLIPPING, "g");

  this._failedPlchldrs = [];
  
  clipInClipMatches = [...aClippingInfo.text.matchAll(clipInClipRe)];

  if (clipInClipMatches.length > 0) {
    let startIdx = 0;
    for (let i = 0; i < clipInClipMatches.length; i++) {
      let match = clipInClipMatches[i];
      let preTxt = match.input.substring(startIdx, match.index);
      let clippings = await aeClippings.getClippingsByName(match[1]);
      let clippingTxt = "";
      if (clippings.length > 0) {
        clippingTxt = clippings[0].content;
      }
      else {
        // If clipping doesn't exist, then placeholder should be inserted as is
        clippingTxt = match[0];
        this._failedPlchldrs.push(match[0]);
      }
      
      processedTxt += preTxt + clippingTxt;
      startIdx = match.index + match[0].length;
    }

    // Get the rest of the clipping.
    processedTxt += aClippingInfo.text.substring(startIdx);
  }
  else {
    processedTxt = aClippingInfo.text;
  }

  let date = new Date();
  rv = processedTxt.replace(/\$\[DATE\]/gm, date.toLocaleDateString());
  rv = rv.replace(/\$\[TIME\]/gm, date.toLocaleTimeString());
  rv = rv.replace(/\$\[NAME\]/gm, aClippingInfo.name);
  rv = rv.replace(/\$\[FOLDER\]/gm, aClippingInfo.parentFolderName);
  rv = rv.replace(/\$\[HOSTAPP\]/gm, this._hostAppName);
  rv = rv.replace(/\$\[UA\]/gm, this._userAgentStr);

  let hasFmtDateTime = false;
  hasFmtDateTime = (this.REGEXP_DATE.exec(processedTxt) != null || this.REGEXP_TIME.exec(processedTxt) != null);

  if (hasFmtDateTime) {
    let dtPlaceholders = [];
    let dtReplaced = [];
    let plchldrType = [];

    let fmtDateRe = /\$\[DATE\(([AaDdHhKkMmosYLlTZ ,.:\-\/]+)\)\]/g;
    let fmtDateResult;
    while ((fmtDateResult = fmtDateRe.exec(aClippingInfo.text)) != null) {
      dtPlaceholders.push(fmtDateResult[1]);
      plchldrType.push("D");
    }

    let fmtTimeRe = /\$\[TIME\(([AaHhKkmsLTZ .:]+)\)\]/g;
    let fmtTimeResult;
    while ((fmtTimeResult = fmtTimeRe.exec(aClippingInfo.text)) != null) {
      dtPlaceholders.push(fmtTimeResult[1]);
      plchldrType.push("T");
    }

    this._processDateTimePlaceholders(dtPlaceholders, dtReplaced);

    for (let i = 0; i < dtPlaceholders.length; i++) {
      let suffix = "";
      if (plchldrType[i] == "D") {
	suffix = "$[DATE(";
      }
      else if (plchldrType[i] == "T"){
	suffix = "$[TIME(";
      }
      let dtPlchldr = suffix + dtPlaceholders[i] + ")]";
      rv = rv.replace(dtPlchldr, dtReplaced[i]);
    }
  }

  // Process compose details and substitute values for email-related
  // placeholders.
  let subj = '', to = '', toN = '', toE = '',
      from = '', fromN = '', fromE = '',
      cc = '', ccN = '', ccE = '';

  subj = aComposeDetails.subject;
  if (!aComposeDetails.isPlainText) {  // HTML format
    subj = this._escapeHTML(subj);
  }

  from = aComposeDetails.from;
  let fromParsed = this._parseEmailAddress(from);
  fromN = fromParsed.name;
  fromE = fromParsed.email;
  if (!aComposeDetails.isPlainText) {
    from = this._escapeHTML(from);
  }

  if (aComposeDetails.to instanceof Array) {
    to = aComposeDetails.to.join(", ");
    if (!aComposeDetails.isPlainText) {
      to = this._escapeHTML(to);
    }

    let toParsed = aComposeDetails.to.map(aTo => this._parseEmailAddress(aTo));
    toN = toParsed.map(aTo => aTo.name).filter(aTo => aTo != '').join(", ");
    toE = toParsed.map(aTo => aTo.email).join(", ");
  }
  else {
    to = aComposeDetails.to;
    let toParsed = this._parseEmailAddress(to);
    toN = toParsed.name;
    toE = toParsed.email;
    if (!aComposeDetails.isPlainText) {
      to = this._escapeHTML(to);
    }
  }
  if (aComposeDetails.cc instanceof Array) {
    cc = aComposeDetails.cc.join(", ");
    if (!aComposeDetails.isPlainText) {
      cc = this._escapeHTML(cc);
    }

    let ccParsed = aComposeDetails.cc.map(aCc => this._parseEmailAddress(aCc));
    ccN = ccParsed.map(aCc => aCc.name).filter(aCc => aCc != '').join(", ");
    ccE = ccParsed.map(aCc => aCc.email).join(", ");
  }
  else {
    cc = aComposeDetails.cc;
    let ccParsed = this._parseEmailAddress(cc);
    ccN = ccParsed.name;
    ccE = ccParsed.email;
    if (!aComposeDetails.isPlainText) {
      cc = this._escapeHTML(cc);
    }
  }

  rv = rv.replace(/\$\[SUBJECT\]/gm, subj);
  rv = rv.replace(/\$\[FROM\]/gm, from);
  rv = rv.replace(/\$\[FROM_NAME\]/gm, fromN);
  rv = rv.replace(/\$\[FROM_EMAIL\]/gm, fromE);
  rv = rv.replace(/\$\[TO\]/gm, to);
  rv = rv.replace(/\$\[TO_NAME\]/gm, toN);
  rv = rv.replace(/\$\[TO_EMAIL\]/gm, toE);
  rv = rv.replace(/\$\[CC\]/gm, cc);
  rv = rv.replace(/\$\[CC_NAME\]/gm, ccN);
  rv = rv.replace(/\$\[CC_EMAIL\]/gm, ccE);

  return rv;
};


aeClippingSubst._parseEmailAddress = function (aNameAndEmailAddrStr)
{
  let rv = {name: '', email: ''};
  // Examples: "Display Name <email@example.com>", "no-name@example.com"
  let parsed = aNameAndEmailAddrStr.split(" <");
  if (parsed.length == 1) {
    // No display name, just email address only.
    rv.email = parsed[0];
  }
  else {
    rv.name = parsed[0];
    rv.email = parsed[1];
    // Get rid of trailing ">"
    rv.email = rv.email.substring(0, rv.email.length - 1);
  }
  
  return rv;
};


aeClippingSubst._escapeHTML = function (aHTMLString)
{
  let rv = aHTMLString.replace(/</g, "&lt;");
  rv = rv.replace(/>/g, "&gt;");

  return rv;
}


aeClippingSubst._processDateTimePlaceholders = function (aPlaceholders, aReplaced)
{
  for (let fmt of aPlaceholders) {
    let dtValue = moment().format(fmt);
    aReplaced.push(dtValue);
  }
};


aeClippingSubst.processAutoIncrPlaceholders = function (aClippingText)
{
  let rv = "";
  
  let fnAutoIncrement = (aMatch, aP1) => {
    let varName = aP1;

    if (varName in this._autoIncrementVars) {
      return ++this._autoIncrementVars[varName];
    }

    let rv = "";
    
    this._autoIncrementVars[varName] = this._autoIncrementStartVal;
    rv = this._autoIncrementVars[varName];
    
    return rv;
  }

  rv = aClippingText.replace(this.REGEXP_AUTO_INCR_PLACEHOLDER, fnAutoIncrement);

  return rv;
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


aeClippingSubst.getFailedPlaceholders = function ()
{
  return this._failedPlchldrs;
};
