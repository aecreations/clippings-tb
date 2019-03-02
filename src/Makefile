# Makefile

EXT_VER=`./getver.pl`
DIST_FILE=clippings-tb-$(EXT_VER).xpi
CHROME = ./chrome
MODULES = ./modules
MODULE_FILES = $(MODULES)/*.js
DEFAULTS_PREFS = ./defaults/preferences
EXCLUDE = \*.html \*~ \*.psp \*.bak


$(DIST_FILE): $(CHROME)/clippings.jar manifest.json $(DEFAULTS_PREFS)/prefs.js
	[ ! -f chrome.manifest.devel ] && mv -v chrome.manifest chrome.manifest.devel && cp -v chrome.manifest.release chrome.manifest
	zip $(DIST_FILE) $(CHROME)/clippings.jar manifest.json chrome.manifest $(DEFAULTS_PREFS)/prefs.js $(MODULE_FILES)

$(CHROME)/clippings.jar: 
	cd $(CHROME); zip -r clippings.jar * -x $(EXCLUDE); zip -d clippings.jar content/strfmt.js content/strtrm.js

clean:
	rm -fv ./$(DIST_FILE) $(CHROME)/clippings.jar
	[ -f chrome.manifest.devel ] && rm -v chrome.manifest && mv -v chrome.manifest.devel chrome.manifest

# End of Makefile
