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

    intr_set(obj, uver) {
        assert(obj.constructor === VariablesBox, this.owner.cls, "Unexpected object type")
        let any_dirty = false
        for(let name in obj.vb) {
            // TBD assert(this.my_vsb.vb[name] === undefined, this.owner.cls, "Variable of this name already exists here")

            // every node input term has its own clone of the VarBox so that it could keep track of if its dirty or not
            // and so that the original (incoming) VarBox dirty flag could be cleared after the node is done running
            if (this.my_vsb.vb[name] === undefined || !vb_equals(obj.vb[name], this.my_vsb.vb[name])) {
                const vb = clone(obj.vb[name])
                vb.vis_dirty = true
                this.my_vsb.vb[name] = vb
                any_dirty = true
            }
        }
        // if this function is called, the var node attach was ran so we assume that's because something changed in it
        // VarNode doesn'd do object caching so it's a safe assumption
        this.tset_dirty(any_dirty)
    }

    is_dirty() {
        return this.dirty
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

// compare VarBoxs
function vb_equals(a, b) {
    if (a.type !== b.type)
        return false
    switch(a.type) {
    case TYPE_BOOL:
    case TYPE_NUM: return a.v === b.v
    case TYPE_VEC2: return vec2.equals(a.v, b.v)
    case TYPE_VEC3: return vec3.equals(a.v, b.v)
    case TYPE_VEC4: return vec4.equals(a.v, b.v)
    }
    throw new Error("VarBox unknown type in vb_equals")
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
    lookup(name) {
        return this.vb[name]
    }

    add(name, vb) {
        this.vb[name] = vb
        this.empty = false
    }
    clear() {
        this.vb = {}
        this.empty = true
    }
    draw() {}
    draw_selection() {}
    draw_template() {}
    
}

// added into expression
class VariableEvaluator extends EvaluatorBase
{
    constructor(varname, line_num) {
        super()
        this.varname = varname
        this.var_box = null
        this.line_num = line_num // line of the first apperance of this variable name
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

        this.namer = new ParamObjStore(node, "<obj-store>", {gen_id:2, prms_lst:[1]}, ()=>{
            for(let p of this.vars_prm)
                for(let param of p.params)
                    node.remove_param(param)
            this.vars_prm.length = 0
            const lst_copy = [...this.namer.v.prms_lst]
            this.namer.v.prms_lst.length = 0 // going to repopulate it
            for(let id of lst_copy)
                this.add_variable(node, id)
            this.v_group.update_elems()
        })

        this.v_group = new ParamGroup(node, "vars_params")

        this.vars_prm = []
        //const p = this.add_variable(node)
        //this.vars_prm = [p]
        this.add_prm_btn = new ParamButton(node, "[+]", ()=>{
            this.add_variable(node)
            this.v_group.update_elems()
        }, ["param_btn", "param_var_add_btn"])

        node.register_rename_observer((newname)=>{
            if (this.vars_prm.length == 1)
                this.vars_prm[0].name.modify(newname)
        })
    }

    any_prm_need_input() {
        for(let p of this.vars_prm)
            if (p.type.sel_idx == 3)
                return true
        return false
    }

    add_variable(node, id = null)
    {
        if (id === null)
            id = this.namer.v.gen_id++
        const prefix = "p" + id + "_";
        const p = {}
        p.id = id
        this.namer.v.prms_lst.push(id)
        this.vars_prm.push(p)

        p.type = new ParamSelect(node, ["Type", prefix], 0, ['Float', 'Integer', 'Float2', 'Float2-Mouse', 'Color', 'Bool'], (sel_idx)=>{ // TBD Transform, Function
            p.expr_float.set_visible(sel_idx == 0)
            p.expr_int.set_visible(sel_idx == 1)
            p.expr_vec2.set_visible(sel_idx == 2)
            p.expr_vec2_mouse.set_visible(sel_idx == 3)
            p.mouseState.set_visible(sel_idx == 3)
            p.expr_color.set_visible(sel_idx == 4)
            p.expr_bool.set_visible(sel_idx == 5)

            const prev = node.can_input
            // check if any param has input
            node.can_input = this.any_prm_need_input()
            if (prev != node.can_input) { // was changed?
                draw_nodes()
                if (!node.can_input && node.receives_input) { // just changed out of it, make sure it no longer receives input
                    program.set_input_node(node)
                }
            }
        })
        p.remove_btn = new ParamButton(node, ["[-]", prefix], ()=>{
            const i = this.vars_prm.findIndex(function(lp) { return Object.is(lp, p) })
            console.assert(i !== -1)
            this.vars_prm.splice(i, 1)
            const ni = this.namer.v.prms_lst.findIndex(function(lid) { return lid === p.id })
            console.assert(ni !== -1)
            this.namer.v.prms_lst.splice(i, 1)            
            for(let pp of p.params)
                node.remove_param(pp)
            this.v_group.update_elems()
        }, ["param_btn", "param_var_rm_btn"]) 
        p.remove_btn.share_line_elem_from(p.type)

        p.name = new ParamStr(node, ["Name", prefix], "var", (v)=>{
            if (this.vars_prm.length == 1) { // with one var the name of the var is the name of the node
                node.set_name(v)
                draw_nodes()
            }
        })
        p.expr_float = new ParamFloat(node, ["Float", prefix], 1.0, {min:0, max:2})
        p.expr_int = new ParamInt(node, ["Integer", prefix], 1, {min:0, max:10})
        p.expr_vec2 = new ParamVec2(node, ["Float2" ,prefix], 0, 0)
        p.expr_color = new ParamColor(node, ["Color", prefix], "#cccccc")
        p.expr_vec2_mouse = new ParamVec2(node, ["Mouse Coord", prefix], 0, 0) // want a different one since we don't want to mess with expr_vec2 being in code or not
        p.expr_vec2_mouse.set_enable(false)  // user never edits it directly
        p.expr_bool = new ParamBool(node, ["Bool", prefix], false)
        p.mouseState = new ParamSelect(node, ["Sample At", prefix], 0, ["Mouse left down", "Mouse move"])
        p.sep = new ParamSeparator(node, prefix + "sep", "param_sep_line")

        // for easy removal
        p.params = [p.type, p.remove_btn, p.name, p.expr_float, p.expr_int, p.expr_vec2, p.expr_color, p.expr_vec2_mouse, p.expr_bool, p.mouseState, p.sep]
        for(let pp of p.params) {
            pp.set_group(this.v_group)
            pp.call_change()            
        }

        p.vb = new VarBox()

        return p
    }

    var_run() {
        let vsb = new VariablesBox()
        let name_set = new Set()
        for(let p of this.vars_prm)
        {
            const name = p.name.v
            assert(name.length > 0, this, "Name can't be empty")
            assert(!name_set.has(name), this, "Name defined multiple times: " + name)
            name_set.add(name)
            vsb.add(name, p.vb)

            switch(p.type.sel_idx) {
            case 0: p.vb.vbset(p.expr_float.get_value(), TYPE_NUM); break;
            case 1: p.vb.vbset(p.expr_int.get_value(), TYPE_NUM); break;
            case 2: p.vb.vbset(p.expr_vec2.get_value(), TYPE_VEC2); break;
            case 3: p.vb.vbset(p.expr_vec2_mouse.get_value(), TYPE_VEC2); break;
            case 4: p.vb.vbset(color_to_uint8arr(p.expr_color.v), TYPE_VEC4); break;
            case 5: p.vb.vbset(p.expr_bool.get_value(), TYPE_BOOL); break;
            }
        }
        this.var_out.set(vsb)
    }

    cclear_dirty() {  // c for cls
        for(let p of this.vars_prm)
            p.vb.vclear_dirty();
    }

    move_action(e, p) {
        const cp = image_view.epnt_to_model(e.pageX, e.pageY)
        p.expr_vec2_mouse.modify(cp)
    }

    inputevent(name, e) {
        if (name == "mousedown" || name == "mouseup") {
            if (e.button == 0) {
                for(let p of this.vars_prm)
                    if (p.mouseState.sel_idx == 0)
                        return true // want to capture
            }
            return false
        }
        if (name != "mousemove") 
            return false

        let did_anything = false
        const move_action = (e, p)=>{
            const cp = image_view.epnt_to_model(e.pageX, e.pageY)
            p.expr_vec2_mouse.modify(cp)
            did_anything = true
        }

        // push and drag can be used only if the press was captured in the image canvase. 
        //  Otherwise, capture from node canvas and drag to image canvas would also move it
        for(let p of this.vars_prm) {
            if (p.mouseState.sel_idx == 0 && ((e.buttons & 1) != 0) && e.img_canvas_capture === true)
                this.move_action(e, p)
            else if (p.mouseState.sel_idx == 1)
                this.move_action(e, p)
        }
        return did_anything

    }
}