# Makefile

EXT_VER=`./getver.pl`
DIST_FILE=clippings-tb-$(EXT_VER).xpi
CHROME = ./chrome
MODULES = ./modules
MODULE_FILES = $(MODULES)/*.js
DEFAULTS_PREFS = ./defaults/preferences
EXCLUDE = \*~ \*.psp \*.bak


$(DIST_FILE): $(CHROME)/clippings.jar manifest.json $(DEFAULTS_PREFS)/prefs.js
	[ ! -f chrome.manifest.devel ] && mv -v chrome.manifest chrome.manifest.devel && cp -v chrome.manifest.release chrome.manifest
	zip $(DIST_FILE) $(CHROME)/clippings.jar manifest.json chrome.manifest $(DEFAULTS_PREFS)/prefs.js $(MODULE_FILES) icon.svg

$(CHROME)/clippings.jar:
	cp ../LICENSE.txt $(CHROME)/content/
	cd $(CHROME); zip -r clippings.jar * -x $(EXCLUDE)

clean:
	rm -fv ./$(DIST_FILE) $(CHROME)/clippings.jar
	rm -fv $(CHROME)/content/LICENSE.txt
	[ -f chrome.manifest.devel ] && rm -v chrome.manifest && mv -v chrome.manifest.devel chrome.manifest

# End of Makefile
