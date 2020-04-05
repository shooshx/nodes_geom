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

        this.my_vsb = new VariablesBox()
        this.h = new PHandle(this.my_vsb) // my own box that contains stuff from all the inputs
    }
    draw_path(ctx, force) {
        if (this.lines.length == 0 && !force)
            return
        const px = this.px(), py = this.py()
        const hw = 4, hh = 9
        const pnts = [px-hw,py-hh, px+hw,py-hh, px+hw,py+hh, px-hw,py+hh, px-hw,py-hh]
        draw_curve(ctx, pnts)
    }

    set(obj) {
        assert(obj.constructor === VariablesBox, this.owner.cls, "Unexpected object type")
        for(let name in obj.vb) {
            assert(this.my_vsb.vb[name] === undefined, this.owner.cls, "Variable of this name already exists here")
            const vb = obj.vb[name]
            this.my_vsb.vb[name] = vb
        }
        this.tset_dirty(true)
    }

    clear() {
        this.h.p.clear()
    }
    
    empty() {
        return this.my_vsb.empty
    }
}

class VarBox {
    constructor() {
        this.v = null
        this.type = null
    }
    vbset(v, type) {
        this.v = v
        this.type = type
    }
}

class VariablesBox extends PObject
{
    static name() { return "Variables" }
    constructor() {
        super()
        this.vb = {} // map variable name to VarBox where type is of TYPE_xxx
        this.empty = true
    }

    add(name, vb) {
        this.vb[name] = vb
        this.empty = false
    }
    clear() {
        this.vb = {}
        this.empty = true
    }
    
}

class VariableEvaluator
{
    constructor(varname, vars_box) {
        this.varname = varname
        this.vars_box = vars_box
    }
    eval() {
        const vb = this.vars_box.vb[this.varname]
        if (vb === undefined)
            throw new ExprErr("Unknown identifier " + this.varname)
        return vb.v
    }
    check_type() {
        const vb = this.vars_box.vb[this.varname]
        if (vb === undefined)
            throw new DependOnVarErr("Unknown identifier " + this.varname) // TBD add at what line
        return vb.type
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
        // TBD show code
        this.type = new ParamSelect(node, "Type", 0, ['Float', 'Float2', 'Color'], (sel_idx)=>{ // TBD Transform, Function
            this.expr_float.set_visible(sel_idx == 0)
            this.expr_vec2.set_visible(sel_idx == 1)
            this.expr_color.set_visible(sel_idx == 2)
        }) 
        this.name = new ParamStr(node, "Name", "var")
        this.expr_float = new ParamFloat(node, "Float", 1.0, {min:0, max:2})
        this.expr_vec2 = new ParamVec2(node, "Float2", 0, 0)
        this.expr_color = new ParamColor(node, "Color", "#cccccc")

        this.vb = new VarBox()
    }

    run() {
        assert(this.name.v.length > 0, this, "Name can't be empty")
        let vsb = new VariablesBox()
        vsb.add(this.name.v, this.vb)

        switch(this.type.sel_idx) {
        case 0: this.vb.vbset(this.expr_float.v, TYPE_NUM); break;
        case 1: this.vb.vbset(this.expr_vec2.get_value(), TYPE_VEC2); break;
        case 2: this.vb.vbset(this.expr_color.v, TYPE_VEC3); break;
        }
        this.var_out.set(vsb)
    }
}