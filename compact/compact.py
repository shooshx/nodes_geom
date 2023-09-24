import sys, os

#from lxml import etree
import lxml.html

this_dir = os.path.dirname(os.path.abspath(__file__))

def main():
    path = os.path.join(this_dir, "..", "index.html")
    #parser = etree.HTMLParser()
    #root = etree.parse(open(path), parser)
    root = lxml.html.fromstring(open(path).read())

    srcs = []
    first = None
    for s in root.iter('script'):
        fname = os.path.abspath(os.path.join(this_dir, "..", s.attrib["src"]))
        print("reading", fname)
        srcs.append(open(fname, encoding="utf-8").read())
        if first is None:
            first = s
        else:
            s.getparent().remove(s)

    uni_src = "\n".join(srcs)
    ojspath = os.path.join(this_dir, "main_compact.js")
    open(ojspath, "w", encoding="utf-8").write(uni_src)
    first.attrib["src"] = "main_compact.js"
    ohtml_path = os.path.join(this_dir, "index.html")
    open(ohtml_path, "wb").write(lxml.html.tostring(root))


if __name__ == "__main__":
    main()
