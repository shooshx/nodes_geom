"use strict";


class NodeHTTPSend extends NodeCls
{
    static name() { return "HTTP Send" }
    constructor(node) {
        super(node)

        this.in = new InTerminal(node, "input")
        this.out = new OutTerminal(node, "output")

        this.attr_name = new ParamStr(node, "Attribute", "face_color")
        this.uri = new ParamStr(node, "URI", "/post_data")
    }

    run() {
        const obj = this.in.get_const()
        assert(obj.arrs !== undefined, this, "Object with no arrays")
        const arr = obj.arrs[this.attr_name.v]
        assert(arr !== undefined, this, "Object does not have attribute " + this.attr_name.v)

        const req = new XMLHttpRequest();
        req.open("POST", this.uri.v, true);
        req.onload = (event) => {
            //console.log("sent")
        }
        
        try {
            req.send(arr)
        }
        catch(e) {
            log.error("failed send " + this.uri.v)
        }

        this.out.set(obj)
    }
}