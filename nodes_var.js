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

        this.my_vsb = new VariablesObj()
        this.h = new PHandle(this.my_vsb, null) // my own box that contains stuff from all the inputs
    }
    draw_path(ctx, force) {
        if (this.lines.length == 0 && !force)
            return
        const px = this.px(), py = this.py()
        const hw = 4, hh = 9
        const pnts = [px-hw,py-hh, px+hw,py-hh, px+hw,py+hh, px-hw,py+hh, px-hw,py-hh]
        draw_curve(ctx, pnts)
    }

    intr_set(cblock, uver) { // from collect_line
        const obj = cblock.po
        assert(obj.constructor === VariablesObj, this.owner.cls, "Unexpected object type")
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
    vclear() { 
        this.h.p.po.clear()
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

// like a shared_ptr for VarBox, holds a single ref count 
// use for global variables so that there won't be garbage left there
// not needed in non-global VariableObj since it is reacreated every frame
class VBRef {
    constructor(vso, name) {
        this.name = name    // VarBox
        this.vso = vso  // VariablesObj
        ++this.vso.vb[name].vref_count
    }
    destroy() {
        if (this.vso === null)
            return
        const vb = this.vso.vb[this.name]
        if (--vb.vref_count === 0) {
            vb.vbset_invalid()
            this.vso.remove(this.name)
        }
        this.vso = null
    }
}


class VarBox {
    constructor() {
        this.v = null
        this.type = null
        this.vdirtied_at_ver = null // this is used for determining dirtyness in a way that doesn't require clear()

        this.pulse_need_reset = false
        this.vref_count = 0
    }
    vbset(v, type) {
        this.v = v
        this.type = type
        this.vdirtied_at_ver = frame_ver
    }
    vbset_invalid() {  // signals dirtiness to all expressions that still hold this var
        this.v = null
        this.type = null
        this.vdirtied_at_ver = frame_ver 
    }

    // implement pulse functionality, this is not a separate class since I don't to need to recreate the VarBox on type change
    trigger() {
        this.pulse_need_reset = true
        this.vbset(true, TYPE_BOOL)        
    }


    vis_dirty() {
        let ret = this.vdirtied_at_ver == frame_ver
        if (!ret && this.pulse_need_reset) {
            this.vbset(false, TYPE_BOOL)
            this.pulse_need_reset = false
            ret = this.vdirtied_at_ver == frame_ver
        }
        return ret
    }
}




class VariablesObj extends PObject
{
    static name() { return "Variables" }
    constructor() {
        super()
        this.vb = {} // map variable name to VarBox where type is of TYPE_xxx

    }
    lookup(name) {
        let r = this.vb[name]
        if (r !== undefined)
            return r
        return null
    }

    set_value(name, value, type) {
        if (this.vb[name] === undefined) {
            const nv = new VarBox()
            this.vb[name] = nv
            nv.vbset(value, type)
        }
        else {
            this.vb[name].vbset(value, type)
        }
    }
    make_ref(name) {
        return new VBRef(this, name)
    }

    add(name, vb) {
        this.vb[name] = vb  // VarBox
    }
    remove(name) {
        delete this.vb[name]
    }
    clear() {
        this.vb = {}
    }
    draw() {}
    draw_selection() {}
    draw_template() {}

    describe(parent, dlg) {
        dlg.clear_desc()
        const grid = add_div(parent, "obj_inf_grid")

        for(let name in this.vb) {
            const vb = this.vb[name]
            const v = vb.v

            const label_e = add_div(grid, "obj_inf_var_label")
            label_e.innerText = name
            const value_e = add_div(grid, "obj_inf_var_value")
            let text, s = []

            switch(vb.type) {
            case TYPE_NUM: text = toFixedMag(v); break;
            case TYPE_VEC2: case TYPE_VEC3:
            case TYPE_VEC4: 
                for(let i = 0; i < v.length; ++i)
                    s.push(toFixedMag(v[i]))
                text = s.join(", ")
                break
            case TYPE_BOOL: text = vv ? "true" : "false"; break;
            case TYPE_MAT3: 
                text = format_matrix(v)
                value_e.classList.add("obj_inf_var_matrix")
                break;
            default: text = vb.v
            }

            value_e.innerText = text
            const type_elem = add_div(grid, "obj_inf_var_type")
            type_elem.innerText = typename(vb.type)
        }
    }
    
}

function format_matrix(v) {
    const s = []
    for(let i = 0; i < 9; ++i)
        s[i] = toFixedMag(v[i])
    const colw = [Math.max(s[0].length, s[1].length, s[2].length), 
                  Math.max(s[3].length, s[4].length, s[5].length),
                  Math.max(s[6].length, s[7].length, s[8].length)]

    let text = ""
    for(let i = 0; i < 3; ++i) {
        for(let j = 0; j < 3; ++j) {
            const idx = i+3*j
            text += s[idx] + " ".repeat(colw[j] - s[idx].length + 2)
        }
        text += "\n"
    }
    return text
}

// added into expression
class VariableEvaluator extends EvaluatorBase
{
    constructor(varname, line_num) {
        super()
        this.varname = varname
        this.var_box = null
        this.line_num = line_num // line of the first apperance of this variable name
        this.name_reused_error = false // set to true if this name is also assigned to in any expression in the node
    }
    is_valid() {
        // if this is set then this evaluator remains as a placeholder and should not be considered when resolving variables
        return !this.name_reused_error
    }
    consumes_subscript() { return false }
    eval() {
        if (this.var_box === null)
            throw new ExprErr("Unknown identifier " + this.varname) // happens when just parsing, not as part of resolve_variables
        return this.var_box.v
    }
    check_type() {
        eassert(!this.name_reused_error, "Identifier " + this.varname + " should not be used as both variable and local symbol", this.line_num)
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


class NodeVarCls extends NodeCls
{
    constructor(node) {
        super(node)
        node.can_display = false
        node.can_input = false
        node.can_enable = false
        node.name_xmargin = 8
        node.width = 80
        node.nkind = KIND_VARS

        this.var_out = new VarOutTerminal(node, "variable_out")

    }

    out_single_var(name, type, value) {
        const vsb = new VariablesObj()
        const vb = new VarBox()
        vsb.add(name, vb)
        vb.vbset(value, type)
        this.var_out.set(vsb)
    }
}


class NodeVariable extends NodeVarCls
{
    static name() { return "Variable" }
    constructor(node) {
        super(node)

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
            node.can_enable = v
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

        // if we're setting global variables, these are the VBRefs last created
        this.cur_glob_refs = []
    }

    toggle_enable_flag(do_draw) {
        this.node.of_program.set_glob_var_node(this.node, do_draw)
        this.node.set_self_dirty()
        if (!this.node.enable_active) {
            // just deactivated, need to remove all current global references, not rely on run() to do it since we might not get run and if we do it's due to selection and too late
            this.del_cur_refs()
        }
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

        if (this.node.is_selected_inf !== null)
            reshow_params_of(this.node) // refresh display labels
    }
    post_load_hook() {
        if (this.brief.v)
            this.set_brief(true) // need to set their display names which were wrong in the initial call_change of the param from load since that was before the params were loaded
    }

    any_prm_need_input() {
        for(let p of this.vars_prm)
            if (p.type.sel_idx === 3 || p.type.sel_idx == 4)
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

        p.type = new ParamSelect(node, ["Type", prefix], 0, ['Float', 'Integer', 'Float2', 'Float2-Mouse', 'Float2-Mouse-Delta', 'Color', 'Bool', 'Bool-Pulse', 'Transform'], (sel_idx)=>{ // TBD Function
            p.expr_float.set_visible(sel_idx === 0)
            p.expr_int.set_visible(sel_idx === 1)
            p.expr_vec2.set_visible(sel_idx === 2)
            p.expr_vec2_mouse.set_visible(sel_idx === 3 || sel_idx === 4)
            p.mouseState.set_visible(sel_idx === 3 || sel_idx === 4)
            p.expr_color.set_visible(sel_idx === 5)
            p.expr_bool.set_visible(sel_idx === 6)
            p.btn_bool_pulse.set_visible(sel_idx === 7)
            p.expr_trans.set_visible(sel_idx === 8)

            const prev = node.can_input
            // check if any param has input
            node.can_input = this.any_prm_need_input()
            if (prev != node.can_input) { // was changed?
                draw_nodes()
                if (!node.can_input && node.receives_input) { // just changed out of it, make sure it no longer receives input
                    this.node.of_program.set_input_node(node)
                }
            }
        })
        p.remove_btn = new ParamButton(node, ["[-]", prefix], ()=>{
            arr_remove_is(this.vars_prm, p)
            arr_remove_eq(this.namer.v.prms_lst, p.id)
            for(let pp of p.params)
                node.remove_param(pp)
            this.v_group.update_elems()
            this.v_group.pset_dirty() // otherwise it wouldn't be saved
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
        p.btn_bool_pulse = new ParamButton(node, ["Trigger", prefix], ()=>{ p.vb.trigger(); p.btn_bool_pulse.pset_dirty() }) // TBD
        p.expr_trans = new ParamTransform(node, ["Transform", prefix])

        p.mouseState = new ParamSelect(node, ["Sample At", prefix], 0, ["Mouse left down", "Mouse move"])
        p.sep = new ParamSeparator(node, prefix + "sep", "param_sep_line")

        // for easy removal
        p.params = [p.p_group, p.type, p.remove_btn, p.up_btn, p.down_btn, p.name, p.expr_float, p.expr_int, p.expr_vec2, p.expr_color, p.expr_vec2_mouse, p.expr_bool, p.btn_bool_pulse, p.expr_trans, p.mouseState, p.sep]
        for(let pp of p.params) {
            if (pp === p.p_group)
                continue // don't want to set the group to the group of this var
            pp.set_group(p.p_group)
            pp.call_change()            
        }

        //p.vb = new VarBox()

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

    run() {
        let out_obj = null
        const is_global = this.global.get_value()
        if (is_global) {
            out_obj = g_anim.globals_vars_box
            if (!this.node.enable_active) { // if it's not enabled, it shouldn't run, just return the global variables unchanged
                this.del_cur_refs()
                this.var_out.set(out_obj)
                return
            }
        }
        else {
            out_obj =  new VariablesObj()
        }

        const name_set = new Set()
        for(let p of this.vars_prm)
        {
            const name = p.name.v
            assert(name.length > 0, this, "Name can't be empty")
            assert(!name_set.has(name), this, "Name defined multiple times: " + name)
            name_set.add(name)

            switch(p.type.sel_idx) {
            case 0: out_obj.set_value(name, p.expr_float.get_value(), TYPE_NUM); break;
            case 1: out_obj.set_value(name, p.expr_int.get_value(), TYPE_NUM); break;
            case 2: out_obj.set_value(name, p.expr_vec2.get_value(), TYPE_VEC2); break;
            case 3: 
            case 4: out_obj.set_value(name, p.expr_vec2_mouse.get_value(), TYPE_VEC2); break;
            case 5: out_obj.set_value(name, color_to_uint8arr(p.expr_color.v), TYPE_VEC4); break;
            case 6: out_obj.set_value(name, p.expr_bool.get_value(), TYPE_BOOL); break;
            case 8: out_obj.set_value(name, p.expr_trans.get_value(), TYPE_MAT3); break;
            }
        }

        // manage references to global vars
        const new_refs = []
        if (is_global)
        {
            // add refs to all current ones
            for(let p of this.vars_prm)
                new_refs.push(out_obj.make_ref(p.name.v))
        }
        // remove ref from all the previous ones, if they existed
        this.del_cur_refs()
        this.cur_glob_refs = new_refs

        this.var_out.set(out_obj)
    }

    del_cur_refs() {
        for (let r of this.cur_glob_refs)
            r.destroy()
        this.cur_glob_refs = []            
    }

    // API
    destructor() {
        this.del_cur_refs()
    }


    inputevent(name, e) {
        let want_capture = false
        if (name == "mouseup") {
            // reset on up
            for(let p of this.vars_prm) {
                if (p.type.sel_idx === 4)
                    p.expr_vec2_mouse.modify_e(0, 0, true, true) // don't keep it with constant delta since if there's animation, it will continue moving
            }
            return
        }           
        if (name == "mousedown" && e.e.button == 0) {
            for(let p of this.vars_prm)
                if (p.mouseState.sel_idx == 0)
                    want_capture = true // want to capture
        }

        // mousedown and mousemove

        //let did_anything = false
        const move_action = (e, p)=>{
            if (p.type.sel_idx === 3) {
                const cp = image_view.epnt_to_model(e.ex, e.ey)
                p.expr_vec2_mouse.modify(cp)
            }
            else if (p.type.sel_idx === 4) {
                p.expr_vec2_mouse.modify_e(e.dx, e.dy, true, true) // force change since dx and dy can be the same if mouse is moving slowly in one axis
            }
            else
                assert(false, this, "unexpected type")
            //did_anything = true
        }

        // push and drag can be used only if the press was captured in the image canvase. 
        //  Otherwise, capture from node canvas and drag to image canvas would also move it
        for(let p of this.vars_prm) {
            if (p.type.sel_idx !== 3 && p.type.sel_idx !== 4)
                continue
            if (p.mouseState.sel_idx == 0 && ((e.buttons & 1) != 0) && (want_capture || e.img_canvas_capture === true))
                move_action(e, p)
            else if (p.mouseState.sel_idx == 1) // any mouse move
                move_action(e, p)
        }
        return want_capture

    }
}


// create a variable and update its value
class NodeVarStep extends NodeVarCls
{
    static name() { return "Variable Step" }
    constructor(node) {
        super(node)
        node.set_state_evaluators({"prev_value":  (m,s)=>{ return new ObjSubscriptEvaluator(m,s) }})

        this.type = new ParamSelect(node, "Type", 0, [["Float", TYPE_NUM], ["Float2", TYPE_VEC2]], (sel_idx)=>{
            this.start_float.set_visible(sel_idx === 0)
            this.update_float.set_visible(sel_idx === 0)
            this.start_vec2.set_visible(sel_idx === 1)
            this.update_vec2.set_visible(sel_idx === 1)
        })
        this.name = new ParamStr(node, "Name", "var")
        this.reset_cond = new ParamBool(node, "Reset Condition", false, null, { expr_visible:true })
        this.start_float = new ParamFloat(node, "Start Float", 0)
        this.start_vec2 = new ParamVec2(node, "Start Float2", 0, 0)
        this.update_float = new ParamFloat(node, "Update Float", 0)
        this.update_vec2 = new ParamVec2(node, "Update Float2", 0, 0)

        this.v = [{value:null, prm_start:this.start_float, prm_update:this.update_float, make_ret:(v)=>{ return v[0] } },
                  {value:null, prm_start:this.start_vec2,  prm_update:this.update_vec2,  make_ret:(v)=>{ return vec2.fromValues(v[0], v[1])} }]
    }

    run() {
        const sel_type = this.type.sel_idx
        let v = this.v[sel_type]
        if (v.value === null || this.reset_cond.get_value()) {
            v.value = v.prm_start.get_value()
            if (sel_type === 0)
                v.value = [v.value] // number needs to be wrapped
        }
        else {
            const need_prev = v.prm_update.need_input_evaler("prev_value")
            if (need_prev !== null)
                need_prev.dyn_set_obj(v.value)
            v.value = v.prm_update.dyn_eval()
        }
        const v_ret = v.make_ret(v.value)
        this.out_single_var(this.name.get_value(), this.type.get_sel_val(), v_ret)
    }
}