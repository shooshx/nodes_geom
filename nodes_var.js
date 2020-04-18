"use strict"

const LINE_COLOR_VARS = "#a9ef50"
const TERM_COLOR_VARS = "#b9ff50"

// only variable node has this
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

// every node has this, hidden in the view if not connected
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
            // every node input term has its own clone of the VarBox so that it could keep track of if its dirty or not
            // and so that the original (incoming) VarBox dirty flag could be cleared after the node is done running
            const vb = clone(obj.vb[name])
            this.my_vsb.vb[name] = vb
        }
        //this.tset_dirty(true)
    }

    // every time a node that has in variables is run:
    // - set() is called for each of its its var input
    // - do_run() called, vars are resolved
    // - clear() is called at the end of the run
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
        this.vis_dirty = false
    }
    vbset(v, type) {
        this.v = v
        this.type = type
        this.vis_dirty = true
    }
    vclear_dirty() {
        this.vis_dirty = false
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

// added into expression
class VariableEvaluator extends NodeBase
{
    constructor(varname) {
        super()
        this.varname = varname
        this.var_box = null
    }
    consumes_subscript() { return false }
    eval() {
        if (this.var_box === null)
            throw new ExprErr("Unknown identifier " + this.varname) // happens when just parsing, not as part of resolve_variables
        return this.var_box.v
    }
    check_type() {
        if (this.var_box === null)
            throw new DependOnVarErr("Unknown identifier " + this.varname) 
        return this.var_box.type
    }
    to_glsl(emit_ctx) {
        if (this.var_box === null)
            throw new DependOnVarErr("Unknown identifier " + this.varname) 
        emit_ctx.add_uniform(this.var_box.type, this.varname, this)
        return this.varname
    }

}

class NodeVariable extends NodeCls
{
    static name() { return "Variable" }
    constructor(node) {
        super(node)
        node.can_display = false
        node.can_input = true
        node.name_xmargin = 8
        node.width = 80
        node.nkind = KIND_VARS
        this.var_out = new VarOutTerminal(node, "variable_out")
        // TBD show code
        this.type = new ParamSelect(node, "Type", 0, ['Float', 'Integer', 'Float2', 'Float2-Mouse', 'Color'], (sel_idx)=>{ // TBD Transform, Function
            this.expr_float.set_visible(sel_idx == 0)
            this.expr_int.set_visible(sel_idx == 1)
            this.expr_vec2.set_visible(sel_idx == 2)
            this.expr_vec2_mouse.set_visible(sel_idx == 3)
            this.mouseState.set_visible(sel_idx == 3)
            this.expr_color.set_visible(sel_idx == 4)

            const prev = node.can_input
            node.can_input = sel_idx == 3
            if (prev != node.can_input) {
                draw_nodes()
                if (!node.can_input && node.receives_input) { // just changed out of it, make sure it no longer receives input
                    set_input_node(node)
                }
            }
        }) 
        this.name = new ParamStr(node, "Name", "var", (v)=>{
            node.set_name(v)
            draw_nodes()
        })
        this.expr_float = new ParamFloat(node, "Float", 1.0, {min:0, max:2})
        this.expr_int = new ParamInt(node, "Integer", 1, {min:0, max:10})
        this.expr_vec2 = new ParamVec2(node, "Float2", 0, 0)
        this.expr_color = new ParamColor(node, "Color", "#cccccc")
        this.expr_vec2_mouse = new ParamVec2(node, "Mouse Coord", 0, 0) // want a different one since we don't want to mess with expr_vec2 being in code or not
        this.expr_vec2_mouse.set_enable(false)  // user never edits it directly
        this.mouseState = new ParamSelect(node, "Sample At", 0, ["Mouse left down", "Mouse move"])

        node.register_rename_observer((newname)=>{this.name.modify(newname)})

        this.vb = new VarBox()
    }

    var_run() {
        assert(this.name.v.length > 0, this, "Name can't be empty")
        let vsb = new VariablesBox()
        vsb.add(this.name.v, this.vb)

        switch(this.type.sel_idx) {
        case 0: this.vb.vbset(this.expr_float.get_value(), TYPE_NUM); break;
        case 1: this.vb.vbset(this.expr_int.get_value(), TYPE_NUM); break;
        case 2: this.vb.vbset(this.expr_vec2.get_value(), TYPE_VEC2); break;
        case 3: this.vb.vbset(this.expr_vec2_mouse.get_value(), TYPE_VEC2); break;
        case 4: this.vb.vbset(color_to_uint8arr(this.expr_color.v), TYPE_VEC4); break;
        }
        this.var_out.set(vsb)
    }

    cclear_dirty() {
        this.vb.vis_dirty = false;
    }

    move_action(e) {
        const cp = image_view.epnt_to_model(e.pageX, e.pageY)
        this.expr_vec2_mouse.modify(cp)
    }

    inputevent(name, e) {
        if (name == "mousedown" || name == "mouseup") {
            if (this.mouseState.sel_idx == 0 && e.button == 0)
                return true // want to capture
            return false
        }
        if (name != "mousemove") 
            return false
        if (this.mouseState.sel_idx == 0 && ((e.buttons & 1) != 0))
            this.move_action(e)
        else if (this.mouseState.sel_idx == 1)
            this.move_action(e)
        else
            return false
        return true

    }
}