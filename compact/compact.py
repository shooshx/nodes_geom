import sys, os
import lxml.html
import subprocess

this_dir = os.path.dirname(os.path.abspath(__file__))

use_strict = '"use strict";'
header = '''
"use strict";
'''
footer = '''
window.page_onload = page_onload
'''

def main():
    path = os.path.join(this_dir, "..", "index.html")
    #parser = etree.HTMLParser()
    #root = etree.parse(open(path), parser)
    root = lxml.html.fromstring(open(path).read())

    srcs = [header]
    first = None
    for s in root.iter('script'):
        fname = os.path.abspath(os.path.join(this_dir, "..", s.attrib["src"]))
        print("reading", fname)
        txt = open(fname, encoding="utf-8").read()
        if txt.startswith(use_strict):
            txt = txt[len(use_strict):]
        srcs.append(txt)
        if first is None:
            first = s
        else:
            s.getparent().remove(s)

    srcs.append(footer)
    uni_src = "\n".join(srcs)

    ojspath = os.path.join(this_dir, "main_compact.js")
    open(ojspath, "w", encoding="utf-8").write(uni_src)

    #os.system(r'JSMin\jsmin.exe < main_compact.js > main_compact.min.js')
    os.system(r'"C:\Program Files\Java\jdk-21\bin\java.exe" -jar closure_compiler\closure-compiler-v20230802.jar --js main_compact.js --js_output_file main_compact.min.js --assume_function_wrapper')

    first.attrib["src"] = "main_compact.min.js"
    ohtml_path = os.path.join(this_dir, "index.html")
    open(ohtml_path, "wb").write(lxml.html.tostring(root))




if __name__ == "__main__":
    main()
