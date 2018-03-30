/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 *  aeDictionary XPCOM component
 *  Version: $Revision: 1.3 $
 *
 *  $Id: aeDictionary.js,v 1.3 2012/11/02 05:27:23 ateng Exp $
 */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");


/*
 * Constants
 */
const DICTIONARY_CONTRACTID = 'clippings@mozdev.org/dictionary;1';
const DICTIONARY_CID = Components.ID('{1dd0cb45-aea3-4a52-8b29-01429a542863}');
const DICTIONARY_IID = Components.interfaces.aeIDictionary;

/*
 * Class definitions
 */

/* The aeDictionary class constructor. */
function aeDictionary() {
    this.hash = {};
}

/* the aeDictionary class def */
aeDictionary.prototype= {
    hasKey: function(key) { return this.hash.hasOwnProperty(key) },

    getKeys: function(count) {
        var asKeys = new Array();
        for (var sKey in this.hash) asKeys.push(sKey);
        count.value = asKeys.length;
        return asKeys;
    },

    getValue: function(key) { 
        if (!this.hasKey(key))
            throw Components.Exception("Key doesn't exist");
        return this.hash[key]; 
    },

    setValue: function(key, value) { this.hash[key] = value; },
    
    deleteValue: function(key) {
        if (!this.hasKey(key))
            throw Components.Exception("Key doesn't exist");
        var oOld = this.getValue(key);
        delete this.hash[key];
        return oOld;
    },

    clear: function() { this.hash = {}; },

    // Component registration
    classDescription: "Dictionary data structure class",
    classID:          DICTIONARY_CID,
    contractID:       DICTIONARY_CONTRACTID,
    QueryInterface:   XPCOMUtils.generateQI([DICTIONARY_IID])
};


const NSGetFactory = XPCOMUtils.generateNSGetFactory([aeDictionary]);


