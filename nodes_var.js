"use strict"

const LINE_COLOR_VARS = "#a9ef50"
const TERM_COLOR_VARS = "#b9ff50"

class VarOutTerminal extends OutTerminal
{
    constructor(in_node, name) {
        super(in_node, name)
        this.kind = KIND_VARS
        this.yoffset = in_node.height/2;
        this.xoffset = in_node.width+2
        this.color = TERM_COLOR_VARS
    }
    draw_path(ctx) {
        const px = this.px(), py = this.py()
        const dr = -6, r = 8, s = 4, re = 9
        const pnts = [px+dr,py-r, px+s,py-r, px+re,py, px+s,py+r, px+dr,py+r, px+dr,py-r ]
        draw_curve(ctx, pnts)
    }
}

class VarsInTerminal extends InTerminal
{
    constructor(in_node, name) {
        super(in_node, name)
        this.kind = KIND_VARS
        this.yoffset = in_node.height/2;
        this.xoffset = -4
        this.color = TERM_COLOR_VARS
    }
    draw_path(ctx, force) {
        if (this.lines.length == 0 && !force)
            return
        const px = this.px(), py = this.py()
        const hw = 4, hh = 9
        const pnts = [px-hw,py-hh, px+hw,py-hh, px+hw,py+hh, px-hw,py+hh, px-hw,py-hh]
        draw_curve(ctx, pnts)
    }
}


class NodeVariable extends NodeCls
{
    static name() { return "Variable" }
    constructor(node) {
        super(node)
        node.can_display = false
        node.name_xmargin = 8
        node.width = 80
        this.var_out = new VarOutTerminal(node, "variable_out")
    }

    run() {

    }
}