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

    intr_set(obj, uver) { // from collect_line
        assert(obj.constructor === VariablesBox, this.owner.cls, "Unexpected object type")
        let any_dirty = false
        for(let name in obj.vb) {
            // TBD assert(this.my_vsb.vb[name] === undefined, this.owner.cls, "Variable of this name already exists here")

            // every node input term has its own clone of the VarBox so that it could keep track of if its dirty or not
            // and so that the original (incoming) VarBox dirty flag could be cleared after the node is done running
            if (this.my_vsb.vb[name] === undefined || !vb_equals(obj.vb[name], this.my_vsb.vb[name])) {
                const vb = clone(obj.vb[name]) // TBD still neede with new dirty mechanism?
                //vb.vis_dirty = true
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
    
    /*empty() {
        return this.my_vsb.empty
    }*/
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
        this.vdirtied_at_ver = null // this is used for determining dirtyness in a way that doesn't require clear()
    }
    vbset(v, type) {
        this.v = v
        this.type = type
        this.vdirtied_at_ver = frame_ver
    }
    vclear_dirty() {
        //this.vis_dirty = false
    }
    vis_dirty() {
        return this.vdirtied_at_ver == frame_ver
    }
}

class VariableInnerBox {
    constructor() {
        this.vb = {}
    }
    add(name, vb) {
        this.vb[name] = vb
    }
    vclear() {
        this.vb = {}
    }
}

class VariablesBox extends PObject
{
    static name() { return "Variables" }
    constructor() {
        super()
        this.vb = {} // map variable name to VarBox where type is of TYPE_xxx
        this.nss = new Map()  // namespaces for gloval var nodes
        //this.empty = true // not used
    }
    lookup(name) {
        let r = this.vb[name]
        if (r !== undefined)
            return r
        // one level recursive
        for(let m of this.nss.values()) {
            r = m.vb[name]
            if (r !== undefined)
                return r
        }
    }

    get_ns(name) {
        return this.nss.get(name)
    }

    add_ns(name) {
        const vb = new VariableInnerBox()
        this.nss.set(name, vb)
        return vb
    }
    remove_ns(name) {
        delete this.nss.delete(name)
    }

    add(name, vb) {
        this.vb[name] = vb
        //this.empty = false
    }
    clear() {
        this.vb = {}
        //this.empty = true
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
        node.can_global = false
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
        this.global = new ParamBool(node, "Global Namespace", false, (v)=>{
            node.can_global = v
            draw_nodes()
        }, {allow_expr:false})
        this.brief = new ParamBool(node, "Brief View", false, (v)=>{
            this.set_brief(v)
        }, {allow_expr:false})
        this.brief.share_line_elem_from(this.global)

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

    set_brief(v) 
    {
        this.add_prm_btn.set_visible(!v)
        for(let p of this.vars_prm) {
            p.type.set_visible(!v)
            p.remove_btn.set_visible(!v)
            p.name.set_visible(!v)
            p.mouseState.set_visible(!v && p.type.sel_idx == 3)
            p.sep.set_visible(!v)
            p.up_btn.set_visible(!v)
            p.down_btn.set_visible(!v)
            for(let name of ["expr_float", "expr_int", "expr_vec2", "expr_vec2_mouse", "expr_color", "expr_bool"]) {
                if (v) {
                    // need to save a backup of the original name that looked like "Float"
                    if (p[name].label_display_bak === undefined) // do it only on the first time since only the first time the label_display is what it was inited with
                        p[name].label_display_bak = p[name].label_display
                    p[name].label_display = p.name.get_value()
                }
                else {
                    if (p[name].label_display_bak !== undefined) // will be undefined on the first call from load
                        p[name].label_display = p[name].label_display_bak
                }
            }
        }

        if (is_nodes_param_shown(this.node))
            show_params_of(this.node) // refresh display labels
    }
    post_load_hook() {
        if (this.brief.v)
            this.set_brief(true) // need to set their display names which were wrong in the initial call_change of the param from load since that was before the params were loaded
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

        p.p_group = new ParamGroup(node, prefix + "group")
        p.p_group.set_group(this.v_group)

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

        p.up_btn = new ParamButton(node, ["[/\\]", prefix], ()=>{
            this.move_variable(id, -1)
        }, ["param_btn", "param_var_arrow", "param_var_up_btn"])
        p.up_btn.share_line_elem_from(p.type)

        p.down_btn = new ParamButton(node, ["[\\/]", prefix], ()=>{
            this.move_variable(id, 1)
        }, ["param_btn", "param_var_arrow", "param_var_down_btn"])
        p.down_btn.share_line_elem_from(p.type)

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
        p.params = [p.p_group, p.type, p.remove_btn, p.up_btn, p.down_btn, p.name, p.expr_float, p.expr_int, p.expr_vec2, p.expr_color, p.expr_vec2_mouse, p.expr_bool, p.mouseState, p.sep]
        for(let pp of p.params) {
            if (pp === p.p_group)
                continue // don't want to set the group to the group of this var
            pp.set_group(p.p_group)
            pp.call_change()            
        }

        p.vb = new VarBox()

        return p
    }
    get_sorted_labels(for_group) {
        if (for_group !== this.v_group)
            return null
        const lst = []
        for(let id of this.namer.st_get("prms_lst"))
            lst.push("p" + id + "_group")
        return lst
    }

    move_variable(id, dir) {
        let lst = this.namer.st_get("prms_lst")
        // modifying directly the list that is referenced in namer
        const idx = lst.indexOf(id)
        if (idx === -1)
            console.error("didn't find index of ", id)
        if (idx + dir < 0 || idx + dir >= lst.length)
            return
        lst.splice(idx, 1)
        lst.splice(idx + dir, 0, id)

        this.v_group.update_elems()
      
    }

    var_run() {
        let vsb = null, out_obj = null
        if (this.global.get_value()) {
            // every global vars node has its own namespace in g_anim so that it can recreate all its vars every time so there won't be garbage left there
            out_obj = g_anim.vars_box
            vsb = g_anim.vars_box.get_ns("glob_" + this.node.id)
            if (vsb !== undefined)
                vsb.vclear()
            // can be undefined if the node is just selected but not marked active, in that case, just do the output terminal
        }
        
        if (vsb === null || vsb === undefined) {
            vsb = new VariablesBox()
            out_obj = vsb
        }

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
        this.var_out.set(out_obj)
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