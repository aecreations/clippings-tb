# Makefile

EXT_VER=`./getver.py`
DIST_FILE=clippings-tb-$(EXT_VER).xpi
EXCLUDE = \*~ \*.psp \*.bak *\.pl Makefile


$(DIST_FILE):
	cp -v ../LICENSE.txt .
	zip -r $(DIST_FILE) * -x $(EXCLUDE)

clean:
	rm -fv $(DIST_FILE)
	rm -fv LICENSE.txt

# End of Makefile
