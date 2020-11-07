"use strict"

class Parameter
{
    constructor(node, label) {
        this.label = label
        this.label_elem = null  // use for changing the label 
        this.line_elem = null  // used for enable
        this.enable = true
        this.visible = true
        if (node !== null) { // will be null in DispParams
            // check the name is not already there (key for serialization)
            for(let p of node.parameters)
                if (p.label === label)
                    throw new Error("Can't have two parameters with the same label " + label)
            node.parameters.push(this)
        }
        this.owner = node
        this.dirty = true  // was it changed since the last run?
        this.change_func = null
        this.shares_line_from = null  // to have more than one param in the same line
        this.group_param = null  // member of a group? used for param aggregation
        this.my_expr_items = []  // ExpressionItem objects in me
        this.shader_generated = false  // for knowing if to create proxies 
    }
    set_label(text) {
        this.label = text
        if (this.label_elem !== null) // can be null if we call this before displaying elements
            this.label_elem.innerText = text
        this.owner.rename_param(this, text)
    }
    set_enable(v) {
        if (this.enable == v)
            return
        this.enable = v
        if (this.line_elem !== null)
            elem_set_enable(this.line_elem, this.enable)
    }
    set_visible(v) {
        if (this.visible == v)
            return
        this.visible = v
        if (this.line_elem !== null)
            elem_set_visible(this.line_elem, this.visible)
    }
    pis_visible() {
        return this.visible
    }
    init_enable_visible() {
        if (this.line_elem !== null) {
            if (!this.enable)
                elem_set_enable(this.line_elem, false) 
            if (!this.visible)
                elem_set_visible(this.line_elem, false)
        }
    }
    pset_dirty(draw=true) { // p for parameter to differentiate it from the others
        this.dirty = true
        if (draw)
            trigger_frame_draw(true)
    }
    pclear_dirty() {
        this.dirty = false
    }
    pis_dirty() {
        return this.dirty
    }
    call_change() { // reimplemet this if this.v is not the value
        if (this.change_func) 
            this.change_func(this.v)
    }
    get_value() { // reimplement if this.v is not ther value
        // checked get_value instead of referencing .v directly, to check if the expression that made this was actually evaluated fully
        dassert(this.v !== null, "value of expr not set")
        return this.v
    }
    share_line_elem_from(param) {
        this.shares_line_from = param   
    }
    is_sharing_line_elem() {
        if (this.shares_line_from === null)
            return false
        // if we're sharing the same visibility state, it measn we're probably related so anyway put us in the same line
        if (this.visible == this.shares_line_from.visible)
            return this.shares_line_from !== null
        // if we don't have the same visibility, add me to him only if he's visible, otherwise, I'm on my own
        return this.shares_line_from.visible
    }
    set_group(group_param) {
        this.group_param = group_param
    }

    reg_expr_item(expr) {
        this.my_expr_items.push(expr)
    }
    resolve_variables(vars_box) { // each param that has expr_items implements this to its exprs
        for(let expr of this.my_expr_items)
            expr.eresolve_variables(vars_box)
    }
    reeval_all_exprs() {
        for(let expr of this.my_expr_items)
            if (expr.eis_active())
                expr.peval_self()
    }

    set_shader_generated(v) { this.shader_generated = v }  // mark param automatically generated from shader code
    is_shader_generated() { return this.shader_generated }
}

// if the text of one of the labels is too long, fix the length of all of them
function fix_label_lengths(parameters) {
    let max_width = 0
    for(let p of parameters) {
        if (p.label_elem) {
            if (p.label_elem.scrollWidth > p.label_elem.offsetWidth) // it's bigger that the space for it
                max_width = Math.max(max_width, p.label_elem.scrollWidth + 5)
            else if (p.label_elem.style.width !== '')  // we previosly set a width to it (needed for groups readding params)
                max_width = Math.max(max_width, p.label_elem.scrollWidth)
        }
    }
    if (max_width != 0) {
        for(let p of parameters) {
            if (p.label_elem !== null)
                p.label_elem.style.width = max_width + "px"
        }
    }
}

function elem_set_visible(e, v) {
    e.classList.toggle("param_invisible", !v)
}
function elem_set_enable(e, v) {
    e.classList.toggle("param_disabled", !v)
}

function clear_elem_byid(id) {
    let e = document.getElementById(id)
    return clear_elem(e)
}
function clear_elem(e) {
    let cNode = e.cloneNode(false);
    e.parentNode.replaceChild(cNode, e);
    return cNode    
}

// list of callbacks that want to get a call
// in the current "add_elems"
let g_params_popups = [] 
function show_params_of(node) {
    // clear children
    param_dismiss_popups() // we there just happen to be anything left, dismiss it before we forget it
    g_params_popups.length = 0
    let div_params_list = clear_elem_byid('div_params_list')
    if (node === null)
        return
    
    for(let p of node.parameters) {
        p.add_elems(div_params_list)
        p.init_enable_visible()
    }
    fix_label_lengths(node.parameters)
}

function param_dismiss_popups() {
    for(let callback of g_params_popups)
        callback()
}
function param_reg_for_dismiss(callback) {
    g_params_popups.push(callback)
}

// this is used to identify when the param-set is changed so it needs to be re-displayed
function get_param_list_labels_key(params) {
    let ret = ""
    for(let p of params)
        if (p !== null)
            ret += p.label + "_"
    return ret
}
// display_values is held per-node and is a map of string to value
// disp_params is produced by the object and holds how to display the params and it's default value
//  TBD don't really need to do this every frame
var g_prev_disp_node = null, g_prev_param_labels_key = null
function show_display_params(obj, disp_node) {
    let params = null
    if (disp_node && obj)
        params = obj.get_disp_params(disp_node.display_values) // sets defaults if needed
    // params can have nulls or objects that don't have disp_params
    if (obj === null || params === null || disp_node === null || disp_node !== selected_node) {
        clear_elem_byid('div_display_params')
        g_prev_disp_node = null
        return
    }
    const labels_key = get_param_list_labels_key(params)
    if (disp_node === g_prev_disp_node && labels_key === g_prev_param_labels_key)
        return // same thing as before, don't need to recreate it. This is needed so that the scale ParamFloat there would be recreated while it is edited
    const div_display_params = clear_elem_byid('div_display_params')
    for(let p of params) {
        if (p !== null && p.add_elems) // the params of a group is an aggregate of it's members, it's not going to have that. FrameBuffer has null disp_params
            p.add_elems(div_display_params)
    }
    g_prev_disp_node = disp_node
    g_prev_param_labels_key = labels_key
}

function create_elem(elem_type, cls) {
    let e = document.createElement(elem_type);
    if (cls !== undefined) {
        if (!Array.isArray(cls))
            cls = [cls]
        e.classList = cls.join(" ")
    }
    return e
}
function add_elem(parent, elem_type, cls) {
    let e = create_elem(elem_type, cls)
    parent.appendChild(e)
    return e
}
function create_div(cls) {
    return create_elem('div', cls)
}

function add_div(parent, cls) {
    let e = create_div(cls)
    parent.appendChild(e)
    return e
}
function add_param_line(parent, param=null, cls='param_line') { 
    if (param !== null) {
        if (param.is_sharing_line_elem()) {
            if (param.shares_line_from.shared_line_elem !== undefined)
                return param.shares_line_from.shared_line_elem  // if it's a multiline, the param defines what it wants to share
            return param.shares_line_from.line_elem
        }
        // line_elem of the group may be null if the group is not displayed since it's an internal node    
        if (param.group_param !== null && param.group_param.line_elem !== null)
            parent = param.group_param.line_elem
    }
    return add_div(parent, cls) 
}
function add_param_multiline(parent, param=null) { 
    return add_param_line(parent, param, 'param_multi_line') 
}
function add_param_block(parent) { return add_div(parent, 'param_block') } // for multi-line params

function add_param_label(line, text, cls) {
    let e = document.createElement('span')
    if (text != null) {
        e.innerText = text
        e.className = 'param_label_pre'
    }
    else
        e.className = 'param_label_pre_empty'
    if (cls !== undefined)
        e.classList.add(cls)

    line.appendChild(e)
    if (text != null) {
        let colon = document.createElement('span')
        colon.className = 'param_label_colon'    
        colon.innerText = ':'  // can't just concatenate this above since the label may change
        line.append(colon)
    }
    return e
}
function add_upload_btn(parent, cls, text, change_func) {
    let fin = add_elem(parent, "input", "param_file_input")
    fin.type = "file"
    fin.id = "p_fl_" + g_input_ids++  // for the "for"
    let btn = add_elem(parent, "label", cls)
    btn.innerText = text
    btn.setAttribute("for", fin.id)
    myAddEventListener(fin, "change", ()=>{
        change_func(fin.files[0]) 
        fin.value = "" // make the input forget about this file so that the same filename can be uploaded again
    })
    return [fin, btn]
}

function formatType(value, type) {
    if (value == true || value == false)
        return value // hack for when FloatParam gets a bool in SetAttr, TBD fix this
    if (type == ED_FLOAT || type == ED_FLOAT_OUT_ONLY)
        return toFixedMag(value)
    if (type == ED_INT)
        return Math.round(value)
    return value
}

const ED_FLOAT=0
const ED_INT=1    // "not float" - not formatted as float
const ED_STR=2
const ED_FLOAT_OUT_ONLY=3  // when parsing ParamFloat, don't pass it throu parseFloat because it's an expression
const ED_COLOR_EXPR=4 // used for expression type check
const ED_VEC2=5 // for code expression type check

function add_param_edit(line, value, type, set_func, cls=null, enter_func=null) {
    let e = document.createElement('input')
    if (cls === null)
        cls = "param_editbox"
    e.classList = ['param_input', cls].join(" ")
    e.type = 'text'
    e.spellcheck = false
    e.value = formatType(value, type)
    // TBD parse error
    myAddEventListener(e, "input", function() { 
        set_func( (type == ED_FLOAT)? parseFloat(e.value) : e.value); 
    })
    if (enter_func !== null) {
        myAddEventListener(e, "keyup", function(e) {
            if (e.keyCode === 13) {
                enter_func()
            }
        })
    }
    /*if (is_float) {
        myAddEventListener(e, "mousedown", function(ev) {
            console.log("~~", ev.buttons, ev.button)
        })
    }*/
    line.appendChild(e)
    return e
}
function add_param_slider(line, min_val, max_val, start_value, type, set_func) {
    const center = add_div(line, "slider_line")
    const fill = add_div(center, "slider_fill")
    const thumb = add_div(center, "slider_thumb")
    const cfg = { min_val: min_val, max_val: max_val, v: null } // v is always in normal units
    const set_len = (len)=>{
        thumb.style.left = len * 100 + "%"
        fill.style.width = len * 100 + "%"
    }
    const r01_to_range = (v)=>{
        return v*(cfg.max_val - cfg.min_val) + cfg.min_val
    }
    const range_to_r01 = (exv)=>{
        if (type === ED_INT)
            exv = Math.round(exv)
        if (cfg.max_val === cfg.min_val)
            exv = 0
        return (exv - cfg.min_val)/(cfg.max_val - cfg.min_val)
    }
    const update = (value)=>{
        if (value === null) {
            thumb.classList.toggle('slider_thumb_disabled', true)
            return
        }
        thumb.classList.toggle('slider_thumb_disabled', false)
        cfg.v = value
        let norm_v = range_to_r01(value)
        norm_v = clamp(0, norm_v, 1)
        // cfg.v can be outside [min,max] right now but for display, we clamp it for the thump positioning to no go overboard
        set_len(norm_v)
    }    
    update(start_value)

    add_move_handlers(thumb, (dx, dy, pageX, pageY)=>{
        const crect = center.getBoundingClientRect()
        let norm_v = (pageX - crect.left)/crect.width
        norm_v = clamp(0, norm_v, 1) // don't let drag outside the visible range
        const new_v = r01_to_range(norm_v)
        if (new_v == cfg.v)
            return
        cfg.v = new_v
        //set_len(norm_v)
        set_func(cfg.v)  // eventually calls update so the above is set_len is not needed
    })


    const update_range = (min,max)=>{
        cfg.min_val = min; cfg.max_val = max        
        update(cfg.v)
    }

    return { update: update, elem: center, update_range: update_range }
    // TBD refactor capture
}

function colorEdit_default_opt() { // can't be const var since function below is still not defined
    return {with_alpha:true, myAddEventListener:myAddEventListener, dropper:start_color_dropper}
}

function add_param_color(line, value, cls, set_func) {
    let e = document.createElement('input')
    e.className = cls
    line.appendChild(e) // must have parent
    let ce = ColorEditBox.create_at(e, 200, function(c) { set_func(c) }, colorEdit_default_opt(), value)
    return [ce.get_color().copy(), e, ce]
}
let g_input_ids = 1
function add_param_checkbox(line, label, value, set_func) {
    let ein = add_elem(line, 'input', 'param_checkbox_input')
    ein.type = 'checkbox'
    ein.id = 'p_chb_' + g_input_ids++
    ein.checked = value
    myAddEventListener(ein, 'change', function() { set_func(ein.checked); })
    let edisp = add_elem(line, 'label', 'param_checkbox_disp')
    edisp.setAttribute("for", ein.id)
    let etext = add_elem(line, 'label', 'param_checkbox_text')
    etext.setAttribute("for", ein.id)
    etext.innerText = label
    return [ein, etext, edisp]
}
function add_push_btn(parent, label, onclick, cls=null) {
    if (cls === null)
        cls = "param_btn"
    else
        cls = cls.concat(["param_btn"])
    let btn = add_div(parent, cls)
    btn.innerText = label
    myAddEventListener(btn, "click", onclick)
    return btn
}
function add_checkbox_btn(parent, label, value, onchange) {
    let ein = add_elem(parent, 'input', 'param_checkbox_input')
    ein.type = 'checkbox'
    ein.id = 'p_chb_' + g_input_ids++
    ein.checked = value
    myAddEventListener(ein, 'change', function() { onchange(ein.checked); })
    let btn = add_elem(parent, 'label', 'param_btn')
    btn.setAttribute("for", ein.id)
    btn.innerText = label
    return [ein, btn, null] // null to be compat with add_param_checkbox
}
function add_combobox(parent, opts, sel_idx, onchange) {
    let se = add_elem(parent, 'select', ['param_select', 'param_input'])
    for(let s of opts) {
        let o = add_elem(se, 'option')
        o.innerText = s
    }
    se.selectedIndex = sel_idx
    myAddEventListener(se, 'change', function() { onchange(se.selectedIndex); })
    return se
}

function start_color_dropper(set_color)
{
    const id = ctx_img.getImageData(0, 0, canvas_image.width, canvas_image.height)
    const back_elem = add_div(main_view, "color_dropper_back");
    myAddEventListener(back_elem, "mousemove", (e)=>{
        const rect = image_view.rect
        if (e.pageX > rect.left && e.pageX < rect.right && e.pageY > rect.top && e.pageY < rect.bottom) {
            const relX = e.pageX - rect.left, relY = e.pageY - rect.top // this is actually the same since rect is in 0,0 but just for good measure
            const idx = (relX + relY * id.width) * 4
            const col = { r: id.data[idx], g: id.data[idx+1], b: id.data[idx+2], alpha: id.data[idx+3]/255 }
            set_color(col)
        }
    })
    myAddEventListener(back_elem, "mouseup", (e)=>{
        main_view.removeChild(back_elem)
    })

}

class ParamSeparator extends Parameter {
    constructor(node) {
        super(node, null)
    }
    save() { return null }
    load(v) {}
    add_elems(parent) {
        add_elem(parent, "hr", "param_separator")
    }
}

// not a real param, just a way to store objects with the params save/load mechanism
// usually stores some other param depending on a SelectParam
class ParamObjStore extends Parameter {
    constructor(node, label, start_v, change_func=null) {
        super(node, label)
        this.v = start_v
        this.change_func = change_func // to get load event
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {}
    st_set(k, v) {
        this.v[k] = v
        this.pset_dirty() 
    }
    st_get(k) {
        dassert(this.v[k] !== undefined, "Unknown store index " + k)
        return this.v[k]
    }
    st_get_all() {
        return this.v
    }
}



class ParamStr extends Parameter {
    constructor(node, label, start_v, change_func) {
        super(node, label)
        this.v = start_v
        this.change_func = change_func
        this.elem = null
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        this.elem = add_param_edit(this.line_elem, this.v, ED_STR, (v)=>{ 
            this.v = v; 
            this.call_change()
            this.pset_dirty() 
        }) 
    }
    modify(v) {
        if (this.v === v)
            return
        this.v = v
        if (this.elem !== null)
            this.elem.value = v
        this.pset_dirty() 
    }
}

class ParamBool extends Parameter {
    constructor(node, label, start_v, change_func) {
        super(node, label)
        this.v = start_v
        this.change_func = change_func
        this.as_btn = false
        this.elem_input = null
    }
    display_as_btn(v) { this.as_btn = v }
    save() { return {v:this.v} }
    load(v) { this.v = v.v; this.call_change()  }
    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        let label_cls_add = null
        if (!this.is_sharing_line_elem()) 
            add_param_label(this.line_elem, null)
        else if (!this.as_btn)
            label_cls_add = "param_checkbox_inline"

        let add_func = this.as_btn ? add_checkbox_btn : add_param_checkbox
        const [ein,label,edisp] = add_func(this.line_elem, this.label, this.v, (v) => {
            this.v = v; 
            this.call_change()
            this.pset_dirty()
        })
        if (label_cls_add)
            edisp.classList.toggle(label_cls_add, true)
        this.elem_input = ein
        this.label_elem = label
    }
    modify(v) {
        if (v === this.v)
            return
        this.v = v
        if (this.elem_input !== null)
            this.elem_input.checked = v
        this.call_change()
        this.pset_dirty()
    }
    get_value() {
        dassert(this.v !== undefined, "value of bool not set")
        return this.v
    }
    gl_set_value(loc) {
        gl.uniform1i(loc, this.get_value())
    }  
}

function get_default(m, k, d) {
    if (m[k] === undefined)
        m[k] = d
    return m[k]
}

class DispParamBool extends ParamBool {
    constructor(disp_values, label, prop_name, start_v) {
        super(null, label, get_default(disp_values, prop_name, start_v), (v)=>{disp_values[prop_name]=v; trigger_frame_draw()})
    }
    pset_dirty() {} // this override is needed to avoid draw triggers that mess with the controls
}

function arr_equals(a, b) {
    if ( (a == null) != (b == null) )
        return false
    if (a == null)
        return true
    if ( (a == undefined) != (b == undefined) )
        return false
    if (a == undefined)
        return true
    if (a.length === undefined || b.length === undefined)
        return a == b
    if (a.length !== b.length)
        return false
    for(let i = 0; i < a.length; ++i)
        if (a[i] !== b[i])
            return false;
    return true
}

// it's also being used for show_code from Param ctor
function normalize_slider_conf(sc) {
    if (sc === null || sc === undefined)
        return {min:0, max:1, visible:false, allowed:true} // allowed false means there's no option to activate it
    else if (sc.min === undefined && sc.allowed === undefined && Array.isArray(sc)) // it's just an array of two nums
        return {min:sc[0], max:sc[1], visible:true, allowed:true }
    if (sc.allowed === undefined)
        sc.allowed = true
    if (sc.visible === undefined)
        sc.visible = sc.allowed
    if (sc.min === undefined)
        sc.min = 0
    if (sc.max === undefined)
        sc.max = 1
    return sc
}
function is_default_slider_conf(sc) {
    return (sc.min === 0 && sc.max === 1 && sc.visible === false && sc.allowed === true)
}
function slider_conf_equal(a, b) {
    return (a.min === b.min && a.max === b.max && a.visible === b.visible && a.allowed === b.allowed)
}

class CustomContextMenu  // custom since it has it's own adders
{
    constructor() {
        this.ctx_menu_elem = null // when the context menu is visible, otherwise null
        this.ctx_menu_adders = [] // list of add_elem(parent) function to populate the context menu
    }
    add_to_context_menu(add_elems_func) {
        this.ctx_menu_adders.push(add_elems_func)
    }

    add_context_menu(line) {
        if (this.ctx_menu_adders.length === 0)
            return
        const dismiss_menu = ()=>{
            if (this.ctx_menu_elem) {
                this.ctx_menu_elem.parentNode.removeChild(this.ctx_menu_elem);   
                this.ctx_menu_elem = null
            }
        }
        const call_adders = (parent)=>{
            for(let adder of this.ctx_menu_adders)
                adder(parent, dismiss_menu)
        }
        myAddEventListener(line, "contextmenu", (e)=>{
            this.ctx_menu_elem = open_context_menu([{cmake_elems: call_adders}], e.pageX, e.pageY, main_view, ()=>{ dismiss_menu() } )
            e.preventDefault()
        })
        param_reg_for_dismiss(()=>{dismiss_menu()})          
    }

}

function round_or_null(v) {
    if (v === null) 
        return null
    return Math.round(v) 
}

// represents a single value (item in a single edit box) that can be an expression and everything it needs to do
class ExpressionItem {
    constructor(in_param, prop_name, prop_type, set_prop=null, get_prop=null, slider_conf=null) {
        this.in_param = in_param
        //this.prop_name = prop_name // name of property to set in the containing param ("v", "r") kept for save,load
        this.prop_name_ser = prop_name // can be changed manually if the saved name need to be different (to avoid collision)
        // when implementing set_prop, get_prop, make sure they preseve setting and getting null from the object, needed for variables
        this.set_prop = (set_prop !== null) ? set_prop : (v)=>{ this.in_param[prop_name] = v }
        this.get_prop = (get_prop !== null) ? get_prop : ()=>{ return this.in_param[prop_name] }
        this.prop_type = prop_type  // constant like ED_FLOAT used for formatting the value
        this.editor = null
        this.e = null  // expression AST, can call eval() on this or null of the value is just a number
        this.se = "" + this.get_prop() // expression string
        this.elast_error = null // {line: msg:} of the error if there was one or null
        this.need_inputs = null // map string names of the inputs needed, already verified that they exist to the ObjRef that needs filling
        this.err_elem = null

        this.override_create_elem = null
        this.parse_opt = PARSE_EXPR
        
        this.slider_conf = normalize_slider_conf(slider_conf)
        this.initial_slider_conf = clone(this.slider_conf)
        this.slider = null // object returned by add_param_slider (has funcs to control slider)
        this.ctx_menu = new CustomContextMenu()
        if (this.slider_conf.allowed) {
            this.add_slider_ctx_menu()
        }
        this.param_line = null
        this.etype = null
        this.etype_undecided = false // these are flags since the expression can be both, not actually read, for debugging
        this.etype_depend_var = false
        this.in_param.reg_expr_item(this)
        this.expr_score = null
        this.variable_evaluators = {}
        // changed for code/non-code expression distinction. expr might be visible but the param might not be
        // used for knowing if the expression must be resolved
        this.eactive = true  
    }
    set_eactive(v) {
        this.eactive = v
    }
    eis_active() {
        // with color, it may still be active since it's the only one but not visible
        return this.in_param.visible && this.eactive
    }
    save_to(r) {
        if (this.e !== null && this.e.get_const_value() !== null)
            r["e_" + this.prop_name_ser] = this.e.get_const_value()
        else {
            const s = this.se.replace(/\r\n/g, '\n') // might have been pasted from windows
            r["se_" + this.prop_name_ser] = s
        }
        if (!slider_conf_equal(this.slider_conf, this.initial_slider_conf)) // don't need to litter
            r["sldcfg_" + this.prop_name_ser] = this.slider_conf
    }
    load(v) {
        const ve = v["e_" + this.prop_name_ser]
        if (ve !== undefined) { // has exact number value
            this.set_to_const(ve)
        }
        else { // parse string
            let vk = v["se_" + this.prop_name_ser]
            if (vk !== undefined && vk !== null) 
                this.peval(vk) 
            else {
                let lv = v[this.prop_name_ser]
                if (lv === undefined) {
                    // old save with no code?
                    //console.error(lv !== undefined, "failed load value")
                    return;
                }
                this.do_set_prop(lv)
            }
        }
        const sldv = v["sldcfg_" + this.prop_name_ser]
        if (sldv !== undefined) // otherwise keep with the one from the ctor
            this.slider_conf = normalize_slider_conf(sldv)
    }
    do_set_prop(v, do_slider_update=true) {
        // v is going to be null if the value is not known yet, due to yet needed objects or yet missing variables
        if (this.prop_type == ED_INT)
            v = round_or_null(v)
        if (do_slider_update && this.slider !== null)
            this.slider.update(v) // slider needs to know if it's disabled or not, called on add_elem
        const ov = this.get_prop()
        if (this.prop_type == ED_COLOR_EXPR) {
            if (arr_equals(v, ov))
                return false
        } else {
            if (v === ov)
                return false
        }
        this.set_prop(v)
        return true
    }

    eset_error(ex) {
        if (this.elast_error !== null)
            return
        this.elast_error = {line:ex.line, msg:ex.message}
        if (this.editor) {
            this.editor.show_err(this.elast_error)
        }
    }
    eclear_error() {
        if (this.elast_error === null) 
            return
        this.elast_error = null
        if (this.editor)
            this.editor.clear_err()
    }
    do_check_type(expect_vars_resolved=false) {
        const etype = ExprParser.check_type(this.e, expect_vars_resolved)        
        if (etype === TYPE_UNDECIDED) {
            this.etype = null
            this.etype_undecided = true
            return
        }
        if (etype == TYPE_DEPEND_ON_VAR) {
            this.etype = null
            this.etype_depend_var = true
            return // can't do it now, will be called again when we have the mesh
        }
        this.etype = etype
        this.etype_depend_var = false  // we know it's neither of these if we got a real type, it can be both of them added at two invocations of this function
        this.etype_undecided = false
        if (this.prop_type == ED_COLOR_EXPR)
            eassert(this.etype === TYPE_VEC3 || this.etype === TYPE_VEC4, "Wrong type, expected a vec3/4, got " + typename(this.etype))
        else if (this.prop_type == ED_VEC2)
            eassert(this.etype === TYPE_VEC2, "Wrong type, expected vec2, got " + typename(this.etype))
        else
            eassert(this.etype === TYPE_NUM, "Wrong type, expected a number, got " + typename(this.etype)) 
    }

    peval_self() {
        this.peval(this.se)
    }
    peval(se) { // parse-eval
        eassert(se !== null && se !== undefined, "unexpected null string-expr")
        this.se = se // might be a plain number as well
        this.eclear_error()
        let state_access = null
        if (this.in_param.owner !== null) {
            state_access = this.in_param.owner.state_access  // all nodes should have this
            if (state_access === null) {
                // if the NodeCls was going to call this it should have done it before creating any Params. We need it now
                // for variables parsing so we create it on demand
                state_access = this.in_param.owner.set_state_evaluators([])
            }
        }
        else  // disp_params have this null
            state_access = new StateAccess([]) 

        let state_access_need_inputs = null
        try {
            state_access.reset_check()
            this.e = ExprParser.parse(se, state_access, this.parse_opt)
            this.variable_evaluators = state_access.need_variables
            state_access_need_inputs = state_access.need_inputs
            this.expr_score = state_access.score  // score determines if the expression depends on anything
            this.etype_undecided = false
            this.etype_depend_var = false
            this.do_check_type()
        }
        catch(ex) { // TBD better show the error somewhere
            this.eset_error(ex)
            if (this.in_param.owner.cls !== undefined) // this can happen if there's an exception in the node initialization value, before cls was assigned to
                set_error(this.in_param.owner.cls, "Parameter expression error")
            return
        }
        finally {
            state_access.need_variables = null // reset it immediately so it won't be used
            state_access.need_inputs = null
            state_access.score = EXPR_CONST
        }
 
        if (this.expr_score == EXPR_CONST) { // depends on anything?
            if (this.do_set_prop(ExprParser.do_eval(this.e)))  // returns false if it's the same value
                this.in_param.pset_dirty() 
            this.need_inputs = null
        }
        else {
            this.do_set_prop(null) // it's dynamic so best if it doesn't have a proper value from before
            if ((this.expr_score & EXPR_NEED_INPUT) != 0) {
                this.need_inputs = state_access_need_inputs
            }
            this.in_param.pset_dirty() // TBD maybe expression didn't change?
        }      

        // needs to be after we possibly did set_prop so it gets the current value
        this.in_param.call_change() // need to do this even if it's not const for glsl in FuncFill
    }


    display_slider(is_first)  // on first display, always add the element if enabled
    {
        if (this.slider_conf.visible && (this.slider == null || is_first)) {
            this.slider = add_param_slider(this.param_line, this.slider_conf.min, this.slider_conf.max, null, this.prop_type, (v)=>{
                if (this.set_to_const(v)) { // might not have changed (with int)
                    this.in_param.call_change()
                    this.in_param.pset_dirty() 
                }
            })
            this.peval_self() // TBD(lazy) this will set the slider position and enablement (but not do pset_dirty since nothing changed)
        }
        else if (!this.slider_conf.visible && this.slider != null) {
            this.slider.elem.parentNode.removeChild(this.slider.elem)
            this.slider = null
        }
    }
    
    add_slider_ctx_menu() {
        let update_range = ()=>{
            if (this.slider === null)
                return
            this.slider.update_range(this.slider_conf.min, this.slider_conf.max)
            save_state()
        }

        let enable_slider_checkbox = (parent)=>{ 
            let sld_line = add_div(parent, 'prm_slider_ctx_line')
            let [ein,etext,edisp] = add_param_checkbox(sld_line, "Slider", this.slider_conf.visible, (v)=>{ 
                this.slider_conf.visible = v; 
                this.display_slider(false)
                toggle_en(v)
                save_state() // nothing else save the state since this is just a GUI change
            })
            //etext.classList.add('ctx_menu_opt')
            let min_line = add_div(parent, 'prm_slider_ctx_line')
            add_elem(min_line, 'SPAN', 'prm_slider_ctx_label').innerText = "Min:"
            add_param_edit(min_line, this.slider_conf.min, ED_FLOAT, (v)=>{ this.slider_conf.min=v; update_range() })
            let max_line = add_div(parent, 'prm_slider_ctx_line')
            add_elem(max_line, 'SPAN', 'prm_slider_ctx_label').innerText = "Max:"
            add_param_edit(max_line, this.slider_conf.max, ED_FLOAT, (v)=>{ this.slider_conf.max=v; update_range() })
            let toggle_en = (v)=>{
                min_line.classList.toggle('param_disabled', !v)
                max_line.classList.toggle('param_disabled', !v)
            }
            toggle_en(this.slider_conf.visible)
        }
        this.ctx_menu.add_to_context_menu(enable_slider_checkbox)
        
    }

    // is_single_value is false for things like vec2 that have multiple values in the same line
    add_editbox(line) {
        this.param_line = line
        // this.e can be null if it stayed null from ctor and there was an error in peval
        //console.assert(this.e !== null && this.e !== undefined, "missing e, should not happen, you need to peval() after ctor") 

        const str_change_callback = (se)=>{this.peval(se)}
        if (this.override_create_elem === null) {
            this.editor = new EditBoxEditor(add_param_edit(line, this.se, ED_STR, str_change_callback))
            if (this.slider_conf.allowed)
                this.display_slider(line, true)
        }
        else {            
            this.editor = this.override_create_elem(line, this.se, str_change_callback, this.in_param.label.replace('\n', ' '))
        }

        if (this.elast_error !== null) {
            this.editor.show_err(this.elast_error)
        }

        this.ctx_menu.add_context_menu(line)

        return this.editor
    }
    set_to_const(v) { // return true if value actually changed
        this.e = ExprParser.make_num_node(v)
        this.se = formatType(v, this.prop_type)
        this.need_inputs = null
        if (this.editor !== null)
            this.editor.set_value(this.se)
        return this.do_set_prop(v) // in color, need it the picker style to not be italic
        // pset_dirty done in caller
    }
    dyn_eval() {
        this.eclear_error()
        if (this.etype === null) { // either undecided or depend on var, doesn't matter since we need to run this anyway
            try {
                this.do_check_type() // in case we need to do it now, after there was a mesh set
            }
            catch(ex) {
                this.eset_error(ex)
                throw ex // will be caught by do_run
            }                     
        }
        if (this.e === null)  // error in expr or const
            return this.get_prop()
        try {
            return ExprParser.do_eval(this.e) // the state_input was put there using the evaler before the call to here
        }
        catch(ex) {
            this.eset_error(ex)
            throw ex // will be caught by the node and node error set by caller          
        }
    }

    eto_glsl(emit_ctx) {
        this.eclear_error()
        try {
            return ExprParser.do_to_glsl(this.e, emit_ctx, this.parse_opt) 
        }
        catch(ex) {
            this.eset_error(ex)
            throw ex 
        }                     
    }

    // returns null or the ObjRef of this name
    need_input_evaler(input_name) {
        if (this.need_inputs === undefined || this.need_inputs === null)
            return null
        let ev = this.need_inputs[input_name]
        if (ev === undefined)
            return null
        return ev
    }
    get_last_error() {
        if (this.elast_error === null)
            return null
        return this.elast_error.msg
    }

    eresolve_variables(in_vars_box) {
        if ((this.expr_score & EXPR_NEED_VAR) == 0)
            return
        try {
            let vis_dirty = false
            // go over the variables in the expr and set values to them
            for(let vename in this.variable_evaluators) {
                const ve = this.variable_evaluators[vename]
                let from_in = in_vars_box.lookup(ve.varname)  // VariablesBox
                if (from_in === undefined)
                    from_in = g_anim.vars_box.lookup(ve.varname) // for frame_num
                if (from_in === undefined) {
                    // resolve can be allowed to fail if this is not a active expression
                    if (this.eis_active()) // maybe don't need to do anything for it if it's not active?
                        throw new ExprErr("Unknown variable " + ve.varname, ve.line_num) // TBD add what line
                    else
                        return
                }
                ve.var_box = from_in
                vis_dirty = vis_dirty || from_in.vis_dirty
            }
            // if ov (old-v) is null, don't even bother checking if it's dirty since we need to eval anyway
            // this can happen when peval() is called (sometimes not even for parsing new expr)
            const ov = this.get_prop()
            if (!vis_dirty && ov !== null)
                return // don't need to do anything since nothing changed

            this.eclear_error() // clear the errors only if we're going to run check_type again              
            ExprParser.clear_types_cache(this.e) // some variable change, it's possible we need to change the type of everything
            this.do_check_type(true)

            // similar to what is done at the end of peval
            if ((this.expr_score & EXPR_NEED_INPUT) != 0) {
                this.do_set_prop(null) // it's dynamic so best if it doesn't have a proper value from before
                this.in_param.pset_dirty()
            }
            else {
                if (this.do_set_prop(ExprParser.do_eval(this.e), false)) // don't do slider-update since we know the it's non-const expr and slider need to remain transparent
                    this.in_param.pset_dirty()
            }
        }
        catch(ex) {
            this.eset_error(ex)
            throw ex // will be caught by do_run
        }            
    }
}

// abstract setting the error and value into an editor object so that it can be interchanged with Ace Editor for code
// this just wraps a normal edit-box
class EditBoxEditor {
    constructor(elem) {
        this.elem = elem
        this.err_elem = null
    }

    show_err(err_text) {
        //let edit_rect = this.elem.getBoundingClientRect(), line_rect = this.this.elem.parentElement.getBoundingClientRect()
        this.err_elem = create_div("param_edit_err_box")
        this.err_elem.innerText = err_text.msg
        this.err_elem.style.left = Math.round(this.elem.offsetLeft) + "px"
        this.err_elem.style.top = Math.round(this.elem.offsetHeight) + "px"
        this.elem.parentElement.insertBefore(this.err_elem, this.elem.nextSibling)

        this.elem.classList.toggle("param_input_error", true)
    }
    clear_err() {
        this.elem.classList.toggle("param_input_error", false) 
        if (this.err_elem) {
            this.err_elem.parentElement.removeChild(this.err_elem)
            this.err_elem = null
        }  
    }

    set_value(v) {
        this.elem.value = v
    }

    get_elem() { return this.elem }
}

// used by all params that have code option
let CodeItemMixin = (superclass) => class extends superclass {
    constructor(node, label, conf) {
        super(node, label)
        this.allowed_code = true
        if (conf !== null && conf.allowed_code === false) {
            this.allowed_code = false
            this.show_code = false
        }
        else {
            this.show_code = (conf !== null && conf.show_code === true) ? true : false  // show code or show line editbox
        }
        // dlg_rect - position and size of dialog, panel_rect - size of editor in panel
        // needs extra indirection so that Editor set into into on popout (saves pos and size of dialog)
        this.dlg_rect_wrap = {dlg_rect: null, panel_rect: null} 
    }

    make_code_item(code_expr, start_v) {
        this.code_item = code_expr
        this.code_item.prop_name_ser = "cv"
        this.code_item.override_create_elem = (line, show_v, change_func, prop_name)=>{          
            const ed = new Editor(line, show_v, change_func, {lang:"glsl", dlg_title:prop_name, dlg_rect_wrap:this.dlg_rect_wrap, with_popout:true});
            return ed
        }
        this.code_item.parse_opt = PARSE_CODE
        this.populate_code_ctx_menu(this.code_item.ctx_menu)
        // initial code string, done even if code is not selected since this is the only place we can do this initialization
        this.code_item.peval("return " + start_v)  

        this.code_line = null
        this.single_line = null  // set in the subclass add_elems
        this.show_code_callback = null        
    }

    add_code_elem() {
        if (!this.allowed_code)
            return
        this.code_line = add_param_line(this.line_elem, this)
        elem_set_visible(this.code_line, this.show_code)
        add_param_label(this.code_line, this.label)
        const code_elem = this.code_item.add_editbox(this.code_line, true)
    }

    save_code(r) {
        delete r.show_code // remove old
        if (this.show_code)
            r.show_code = true // default false, don't add to save space
        if (this.dlg_rect_wrap.dlg_rect !== null)
            r.dlg_rect = this.dlg_rect_wrap.dlg_rect
        if (this.dlg_rect_wrap.panel_rect !== null)
            r.panel_rect = this.dlg_rect_wrap.panel_rect
        this.code_item.save_to(r); 
    }
    load_code(v) {
        this.show_code = v.show_code || false; 
        this.dlg_rect_wrap.dlg_rect = v.dlg_rect || null
        this.dlg_rect_wrap.panel_rect = v.panel_rect || null
        this.code_item.load(v) 
    }

    set_show_code(v) {
        if (v === this.show_code)
            return
        this.show_code = v
        if (this.single_line !== null) { // displayed?
            elem_set_visible(this.single_line, !v)
            elem_set_visible(this.code_line, v)
        }
        this.code_item.set_eactive(v)
        this.non_code_eactive(!v) 

        if (v)  // in case it's a const, set this.v to a value from the right source
            this.code_item.peval_self()
        else
            this.non_code_peval_self()
        if (this.show_code_callback)
            this.show_code_callback(v)  // for updating SetAttr param checkbox
        this.pset_dirty() 
    }

    
    populate_code_ctx_menu(ctx_menu) {
        if (!this.allowed_code)
            return
        const add_code_checkbox = (parent, dismiss_func)=>{
            let chk_line = add_div(parent, 'prm_slider_ctx_line')
            let [ein,etext,edisp] = add_param_checkbox(chk_line, "Code", this.show_code, (v)=>{ 
                this.set_show_code(v)
                dismiss_func()
            })            
        }
        ctx_menu.add_to_context_menu(add_code_checkbox)
    }
};

// used by single-value params that have expression and code ability
class ParamBaseExpr extends CodeItemMixin(Parameter)
{
    constructor(node, label, start_v, ed_type, conf, change_func=null) {
        super(node, label, conf)
        dassert(start_v !== undefined, "start value should not be undefined");
        //this.v = start_v  // numerical value in case of const
        this.item = new ExpressionItem(this, "v", ed_type,  (v)=>{ if (!this.show_code) this.v = v }, null, conf)
        this.populate_code_ctx_menu(this.item.ctx_menu)
        this.single_line = null
        this.item.peval(start_v)  // if it's a param that can be either code or non-code, it's start_v should be a simgle expression
        
        const code_expr = new ExpressionItem(this, "v", ed_type,  (v)=>{ if (this.show_code) this.v = v }, null, {allowed:false})
        this.make_code_item(code_expr, start_v)
        this.change_func = change_func // set change_func after peval so that it won't be called in this initial peval (and the one in the code item), before all the other params were created (it will be called after load)
    }

    non_code_peval_self() {
        this.item.peval_self()
    }
    non_code_eactive(v) {
        this.item.set_eactive(v)
    }

    save() { 
        let r = {}; 
        this.item.save_to(r); 
        this.save_code(r)
        return r
    }
    load(v) { 
        this.item.load(v); 
        this.load_code(v)
    }

    add_elems(parent) {
        this.line_elem = add_param_multiline(parent, this)

        this.single_line = add_param_line(this.line_elem, this)
        elem_set_visible(this.single_line, !this.show_code)
        this.label_elem = add_param_label(this.single_line, this.label)
        const single_elem = this.item.add_editbox(this.single_line, true)

        if (this.is_sharing_line_elem() && this.allowed_code) //  if it's sharing a line, clearly it wasn't meant to be code
            throw new Error("param that shares line doesn't work with allowed_code")
        this.add_code_elem()
    }

    get_active_item() {
        return this.show_code ? this.code_item : this.item
    }

    dyn_eval() {
        return this.get_active_item().dyn_eval()
    }
    need_input_evaler(input_name) {
        return this.get_active_item().need_input_evaler(input_name)
    }
    get_last_error() {
        return this.get_active_item().get_last_error()
    }
    modify(v, dirtyify=true) {  // dirtify false used in NodeFuncFill (when called from within run())
        if (this.show_code)
            return // code item should not be modified since that would erase the code
        if (this.item.set_to_const(v) && dirtyify)
            this.pset_dirty()
    } 
}


class ParamFloat extends ParamBaseExpr {
    constructor(node, label, start_v, conf=null, change_func=null) {
        super(node, label, start_v, ED_FLOAT, conf, change_func)
    }
    gl_set_value(loc) {
        gl.uniform1f(loc, this.get_value())
    }    
}
class ParamInt extends ParamBaseExpr {
    constructor(node, label, start_v, conf=null, change_func=null) {
        super(node, label, start_v, ED_INT, conf, change_func)
        this.item.set_prop = (v)=>{ this.v = round_or_null(v)  }
    }
    gl_set_value(loc) {
        gl.uniform1i(loc, this.get_value())
    }      
}


class DispParamFloat extends ParamFloat {
    constructor(disp_values, label, prop_name, start_v) {
        const slider_values = disp_values[prop_name + "_slider"]
        let conf = { allowed_code:false }
        if (slider_values !== undefined)
            conf = {...conf, ...slider_values}
        const real_start_v = toFixedMag(get_default(disp_values, prop_name, start_v))  // avoid long float tail
        super(null, label, real_start_v, conf, (v)=>{
            disp_values[prop_name] = v
            // reference the slider_conf object and not just copy it so that changes to it made by the ui be saved even if this function is not called
            disp_values[prop_name + "_slider"] = this.item.slider_conf
            trigger_frame_draw()
        })
    }
    pset_dirty() {} // this override is needed to avoid draw triggers that mess with the controls
}


class ParamVec2 extends CodeItemMixin(Parameter) {
    constructor(node, label, start_x, start_y, conf=null) {
        super(node, label, conf)
        dassert(start_x !== undefined && start_y !== undefined, "start value should not be undefined")
        this.x = start_x
        this.item_x = new ExpressionItem(this, "x", ED_FLOAT, (v)=>{ if (!this.show_code) this.x = v }, null, {allowed:false})
        this.y = start_y
        this.item_y = new ExpressionItem(this, "y", ED_FLOAT, (v)=>{ if (!this.show_code) this.y = v }, null, {allowed:false})
        this.dial = null
        this.single_line = null
        this.item_x.peval_self()
        this.item_y.peval_self()

        this.populate_code_ctx_menu(this.item_x.ctx_menu) // need to add only on one of them since it's added on the line

        const code_expr = new ExpressionItem(this, "-unused-", ED_VEC2,  
            (v)=>{ 
                if (!this.show_code) 
                    return 
                if (v === null) { this.x = null; this.y = null; } // happens when doing dynamic eval
                else { this.x = v[0]; this.y = v[1] }
            }, 
            ()=>{ 
                if (this.x === null)
                    return null
                return [this.x,this.y] 
            }, 
            {allowed:false})
        this.make_code_item(code_expr, "vec2(" + start_x + ", " + start_y + ")")
        this.size_dial = null // if was ever created
    }

    non_code_peval_self() {
        this.item_x.peval_self()
        this.item_y.peval_self()
    }
    non_code_eactive(v) {
        this.item_x.set_eactive(v)
        this.item_y.set_eactive(v)
    }
    save() { 
        let r = { }; 
        this.item_x.save_to(r); 
        this.item_y.save_to(r); 
        this.save_code(r)
        return r 
    }
    load(v) { 
        this.item_x.load(v)
        this.item_y.load(v) 
        this.load_code(v)
    }
    add_elems(parent) {
        this.line_elem = add_param_multiline(parent, this)

        this.single_line = add_param_line(this.line_elem, this)
        elem_set_visible(this.single_line, !this.show_code)
        this.label_elem = add_param_label(this.single_line, this.label)
        this.item_x.add_editbox(this.single_line)
        this.item_y.add_editbox(this.single_line)
        this.shared_line_elem = this.single_line

        this.add_code_elem()
    }
    get_value() {
        dassert(this.x !== null && this.x !== undefined, "value of vec2 expr not set")
        return [this.x, this.y]
    }
    increment(dv) {
        if (this.show_code)
            return
        this.item_x.set_to_const(this.x + dv[0])
        this.item_y.set_to_const(this.y + dv[1])
        this.pset_dirty() 
    }
    modify(v, dirtyify=true) {
        this.modify_e(v[0], v[1], dirtyify)
    }
    modify_e(x, y, dirtyify=true) {
        if (this.show_code)
            return
        let changed = false
        changed = this.item_x.set_to_const(x)
        changed |= this.item_y.set_to_const(y)
        if (changed && dirtyify)
            this.pset_dirty() 
    }
    dyn_eval() {
        if (this.show_code)
            return this.code_item.dyn_eval()
        const x = this.item_x.dyn_eval()
        const y = this.item_y.dyn_eval()
        return vec2.fromValues(x, y)
    }
    need_input_evaler(input_name) {
        if (this.show_code)
            return this.code_item.need_input_evaler(input_name)
        // the first one that has it is good since all who has it have the same one (objref)
        return this.item_x.need_input_evaler(input_name) || this.item_y.need_input_evaler(input_name)
    }
    get_last_error() {
        if (this.show_code)
            return this.code_item.get_last_error()
        return this.item_x.get_last_error() || this.item_y.get_last_error()
    }

    gl_set_value(loc) {
        dassert(this.x !== undefined, "value of vec2 expr not set (gl_set)")  // instead of going through get_value()
        gl.uniform2f(loc, this.x, this.y)
    }

    size_dial_draw(transform_v, m) {
        if (this.size_dial === null)
            this.size_dial = new SizeDial(this)
        this.size_dial.draw(transform_v, m)
    }
    size_dial_find_obj(ex, ey) {
        if (this.size_dial === null)
            return // it is first drawn, then clicked
        return this.size_dial.find_obj(ex, ey)
    }

}

class ParamVec2Int extends Parameter {
    constructor(node, label, start_x, start_y) {
        super(node, label)
        this.x = start_x
        this.y = start_y
        this.elem_x = null; this.elem_y = null
    }
    save() { return {x:this.x, y:this.y} }
    load(v) { this.x=v.x; this.y=v.y }
    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        this.label_elem = add_param_label(this.line_elem, this.label)
        this.elem_x = add_param_edit(this.line_elem, this.x, ED_INT, (v) => { this.x = parseInt(v); this.pset_dirty() }) // NOTE with expr v can be null!
        this.elem_y = add_param_edit(this.line_elem, this.y, ED_INT, (v) => { this.y = parseInt(v); this.pset_dirty() })
    }
    set(x, y) { 
        this.x = Math.round(x); this.y = Math.round(y); 
        this.pset_dirty() 
        if (this.elem_x === null)
            return
        this.elem_x.value = this.x
        this.elem_y.value = this.y
    }
    get_value() {
        return [this.x, this.y]
    }
}

function color_comp_clamp(v) {
    return clamp(0, v, 255)
}
function make_rgb_str(c) {
    const s = "(" + c.r + ", " + c.g + ", " + c.b
    if (c.alpha === 1)
        return "rgb" + s + ")"
    return "rgba" + s + ", " + c.alpha + ")"

}

class ParamColor extends CodeItemMixin(Parameter) 
{
    constructor(node, label, start_c_str, conf=null) {
        super(node, label, conf)
        if (!Array.isArray(start_c_str)){
            this.v = ColorPicker.parse_hex(start_c_str)
            start_c_str = [start_c_str, make_rgb_str(this.v)]
        }
        else {
            this.v = ColorPicker.parse_hex(start_c_str[0])
        }
        this.picker = null
        this.picker_elem = null
        this.picker_v = clone(this.v)  // basically the same as v, as if there's no code so that the picker state would be saved
        this.picker_ctx_menu = new CustomContextMenu()
        this.populate_code_ctx_menu(this.picker_ctx_menu)

        const code_expr = new ExpressionItem(this, "-unused-", ED_COLOR_EXPR, 
            (v)=>{
                if (!this.show_code) 
                    return
                return this._set_value_from_arr(v)
            }, 
            ()=>{ 
                if (this.v.r === null)
                    return null
                return vec4.fromValues(this.v.r, this.v.g, this.v.b, this.v.alphai) 
            }, 
            {allowed:false})
        this.make_code_item(code_expr, start_c_str[1])
    }

    // returns true if it did something
    _set_value_from_arr(v) {
        if (v === null) { 
            if (this.v.r === null)
                return false
            this.v.r = null; this.v.g = null; this.v.b = null; this.v.alpha = null; this.v.alphai = null
            return true
        }
        const r = color_comp_clamp(v[0])
        const g = color_comp_clamp(v[1])
        const b = color_comp_clamp(v[2])
        let alpha, alphai
        if (v.length === 3) { // expr result can be either vec3 or vec4
            alphai = 255
            alpha = 1
        }
        else {
            alphai = color_comp_clamp(v[3])
            alpha = this.v.alphai/255
        }        
        if (this.v.r == r && this.v.g == g && this.v.b == b && this.v.alphai == alphai)
            return false
        this.v.r = r; this.v.g = g; this.v.b = b; this.v.alpha = alpha; this.v.alphai = alphai
        return true
    }

    non_code_peval_self() {
        this.v = clone(this.picker_v)
        this.pset_dirty()
    }
    non_code_eactive(v) {
    }
    get_value() { // reimplement if this.v is not ther value
        dassert(this.v.r !== null, "value of color expr not set")
        return this.v
    }
    save() { 
        let r = {}
        if (this.picker_v !== null)
            r.hex = this.picker_v.hex
        this.save_code(r)  // dirty it abit but it doesn't really matter
        return r 
    }
    load(v) { 
        this.load_code(v)
        this.picker_v = ColorPicker.parse_hex(v.hex) // modify picker state, might not be the same as .v due to code
        if (!this.show_code)
            this.v = clone(this.picker_v)
    }
    add_elems(parent) {
        this.line_elem = add_param_multiline(parent, this)

        this.single_line = add_param_line(this.line_elem, this);
        elem_set_visible(this.single_line, !this.show_code)

        this.label_elem = add_param_label(this.single_line, this.label)
        let [iv, elem, picker] = add_param_color(this.single_line, this.picker_v, 'param_input', (v)=>{ 
            if (this.v !== null && this.v.hex == v.hex) 
                return;
            if (v === null)
                this.v = null
            else {
                this.v = v.copy() // make a copy so that this.v will be different object than the internal object
            }
            this.picker_v = clone(this.v)
            this.pset_dirty()
        })
        this.v = iv; 
        this.picker_elem = elem; 
        this.picker = picker
        this.picker_ctx_menu.add_context_menu(this.picker_elem)

        this.add_code_elem()
    }
    dyn_eval() {        
        if (this.show_code) {
            let v = this.code_item.dyn_eval()
            v[0] = color_comp_clamp(v[0])
            v[1] = color_comp_clamp(v[1])
            v[2] = color_comp_clamp(v[2])            
            if (v.length == 3)
                v = vec4.fromValues(v[0], v[1], v[2], 255)
            else
                v[3] = color_comp_clamp(v[3])
            return v
        }
        return vec4.fromValues(this.v.r, this.v.g, this.v.b, this.v.alphai) // constant
    }
    need_input_evaler(input_name) {
        if (this.show_code)
            return this.code_item.need_input_evaler(input_name)
        return null
    }
    get_last_error() {
        if (this.show_code)
            return this.code_item.get_last_error()
        return null
    }
    modify(v, dirtify=true) {
        if (this.show_code)
            return // when in code, modify doesn't work, see ParamBaseExpr
        if (this._set_value_from_arr(v) && dirtify)
            this.pset_dirty(true)
    }
    gl_set_value(loc) {
        dassert(this.v.r !== null, "value of color expr not set (gl)")
        gl.uniform4f(loc, this.v.r/255, this.v.g/255, this.v.b/255, this.v.alpha)
    }   
}



function toFixedMag(f) {
    if (Math.abs(f) < 1e-13)
        return "0"
    let af = Math.min(Math.round(Math.log10(Math.abs(f)))-2, -3)
    return f.toFixed(-af)
}


class ParamTransform extends Parameter {
    constructor(node, label, start_values={}) {
        super(node, label)
        this.translate = [0,0] // coords here are not vec2.fromValues since they need to be nullable
        this.rotate = 0
        this.scale = [1,1]
        this.v = mat3.create()
        this.rotate_pivot = [0,0]
        
        this.elems = {tx:null, ty:null, r:null, sx:null, sy:null, pvx:null, pvy:null }
        this.dial = new TransformDial(this)
        
        const sld_conf = {allowed:false}
        this.item_tx = new ExpressionItem(this, "tx", ED_FLOAT, (v)=>{this.translate[0] = v; this.calc_mat()}, ()=>{ return this.translate[0]}, sld_conf)
        this.item_ty = new ExpressionItem(this, "ty", ED_FLOAT, (v)=>{this.translate[1] = v; this.calc_mat()}, ()=>{ return this.translate[1]}, sld_conf)
        this.item_r = new ExpressionItem(this,   "r", ED_FLOAT, (v)=>{this.rotate = v; this.calc_mat()},       ()=>{ return this.rotate}, {min:0, max:360})
        this.item_pvx = new ExpressionItem(this, "pvx", ED_FLOAT, (v)=>{ this.calc_pivot_counter(v, 0)  }, ()=>{ return this.rotate_pivot[0]}, sld_conf)
        this.item_pvy = new ExpressionItem(this, "pvy", ED_FLOAT, (v)=>{ this.calc_pivot_counter(v, 1)  }, ()=>{ return this.rotate_pivot[1]}, sld_conf)
        this.item_sx = new ExpressionItem(this, "sx", ED_FLOAT, (v)=>{this.scale[0] = v; this.calc_mat()}, ()=>{ return this.scale[0]}, sld_conf)
        this.item_sy = new ExpressionItem(this, "sy", ED_FLOAT, (v)=>{this.scale[1] = v; this.calc_mat()}, ()=>{ return this.scale[1]}, sld_conf)

        this.items = [this.item_tx, this.item_ty, this.item_r, this.item_pvx, this.item_pvy, this.item_sx, this.item_sy]
        this.item_dict = {"tx":this.item_tx, "ty":this.item_ty, "r":this.item_r, "pvx":this.item_pvx, "pvy":this.item_pvy, "sx":this.item_sx, "sy":this.item_sy }        
        
        for(let name in start_values) {
            const item = this.item_dict[name]
            dassert(item !== undefined, "unknown name: " + name)
            item.peval(start_values[name])
        }
        for(let name in this.item_dict) {
            if (start_values[name] === undefined)
                this.item_dict[name].peval_self()
        }
    }
    save() { 
        let r = {} 
        this.item_tx.save_to(r); this.item_ty.save_to(r)
        this.item_r.save_to(r)
        this.item_pvx.save_to(r); this.item_pvy.save_to(r)
        this.item_sx.save_to(r); this.item_sy.save_to(r)
        return r
    }
    load(v) { 
        this.item_tx.load(v); this.item_ty.load(v)
        this.item_r.load(v)
        this.item_pvx.load(v); this.item_pvy.load(v)
        this.item_sx.load(v); this.item_sy.load(v)
        this.calc_mat() 
    }
    calc_mat() {
        mat3.identity(this.v)
        mat3.translate(this.v, this.v, this.translate)
          mat3.translate(this.v, this.v, this.rotate_pivot)
        mat3.rotate(this.v, this.v, glm.toRadian(this.rotate))
          mat3.translate(this.v, this.v, vec2.fromValues(-this.rotate_pivot[0],-this.rotate_pivot[1]))
        mat3.scale(this.v, this.v, this.scale)
        this.pset_dirty()
    }
    is_valid() {
        return !isNaN(this.v[0]) && !isNaN(this.v[1]) && !isNaN(this.v[2]) && 
               !isNaN(this.v[3]) && !isNaN(this.v[4]) && !isNaN(this.v[5]) &&
               !isNaN(this.v[6]) && !isNaN(this.v[7]) && !isNaN(this.v[8])
    }
     // calculate the translation that needs to happen to counter the change in pivot in order for the object not to move
    calc_pivot_counter(v, vind) {
        if (v === null) {
            this.rotate_pivot[vind] = null
            return
        }
        v = parseFloat(v)
        if (isNaN(v))
            return;
        let dv = v - this.rotate_pivot[vind]; 
        this.rotate_pivot[vind] = v
        
        let dp = vec2.create()
        dp[vind] = -dv
        
        let tt = mat3.create()
        mat3.translate(tt, tt, dp)
        mat3.rotate(tt, tt, glm.toRadian(this.rotate))
        dp[vind] = -dp[vind]
        mat3.translate(tt, tt, dp)
        //mat3.invert(tt, tt)
        let dt = vec2.create()
        vec2.transformMat3(dt, dt, tt)
        this.item_tx.set_to_const(this.translate[0] + dt[0]) // TBD does extra calc_mats
        this.item_ty.set_to_const(this.translate[1] + dt[1])
        //this.repaint_elems()
        this.calc_mat()
    }
    add_elems(parent) { 
        this.line_elem = add_param_multiline(parent)
        add_elem(this.line_elem, "hr", "param_separator")
        let line_t = add_param_line(this.line_elem)
        add_param_label(line_t, "Translate")
        this.item_tx.add_editbox(line_t); this.item_ty.add_editbox(line_t)

        let line_r = add_param_line(this.line_elem)
        add_param_label(line_r, "Rotate")
        this.item_r.add_editbox(line_r)

        let line_pv = add_param_line(this.line_elem)
        add_param_label(line_pv, "Pivot")
        this.item_pvx.add_editbox(line_pv); this.item_pvy.add_editbox(line_pv)

        let line_s = add_param_line(this.line_elem)
        add_param_label(line_s, "Scale")
        this.item_sx.add_editbox(line_s); this.item_sy.add_editbox(line_s)
    }
    move(dx, dy) {
        this.item_tx.set_to_const(this.translate[0] + dx); 
        this.item_ty.set_to_const(this.translate[1] + dy); 
    }
    set_translate(x, y) {
        this.item_tx.set_to_const(x); 
        this.item_ty.set_to_const(y); 
    }
    do_rotate(d_angle) {
        let r = this.rotate + d_angle;
        if (r > 360) r -= 360
        if (r < 0) r += 360
        this.item_r.set_to_const(r)
    }
    set_scale(sx, sy) {
        this.item_sx.set_to_const(sx)
        this.item_sy.set_to_const(sy)
    }
    draw_dial_at_obj(obj, m) {
        //if (obj === null)
       //     return // might be it's not connected so it doesn't have output - not used
        // this was replaced with pivot thing. TBD - button for starting pivot should be the center of the bbox instead of 0,0
        let center = vec2.clone(this.rotate_pivot)

        center[0] += this.translate[0]
        center[1] += this.translate[1]
        vec2.transformMat3(center, center, m) // to canvas coords

        this.dial.set_center(center[0], center[1])
        this.dial.draw()
    }

    dyn_eval() {
        let m = mat3.create(), v = vec2.create()
        mat3.identity(m)
        v[0] = this.item_tx.dyn_eval(); v[1] = this.item_ty.dyn_eval()
        mat3.translate(m, m, v)
          // seemingly this does the wrong thing since the translation is not recalculated when the pivot moves but it does seem to work as intended
          v[0] = this.item_pvx.dyn_eval(); v[1] = this.item_pvy.dyn_eval()
          mat3.translate(m, m, v)
        mat3.rotate(m, m, glm.toRadian(this.item_r.dyn_eval()))
          v[0] = -v[0]; v[1] = -v[1]  
          mat3.translate(m, m, v)
        v[0] = this.item_sx.dyn_eval(); v[1] = this.item_sy.dyn_eval()   
        mat3.scale(m, m, v)
        return m
    }
    need_input_evaler(input_name) {
        for(let item of this.items) {
            const ev = item.need_input_evaler(input_name)
            if (ev)
                return ev
        }
        return null
    }
    get_last_error() {
        for(let item of this.items) {
            const er = item.get_last_error()
            if (er)
                return er
        }
        return null
    }
    get_value() { // reimplement if this.v is not ther value
        dassert(this.v !== null, "value of transform expr not set")
        return this.v
    }
    modify(v, dirtyify=true) { 
        // TBD right now this just bypasses the calc_mat logic and does direct setting of the matrix
        // need that for NodeFuncFill where there's no display to this Param so there's no need for all that
        //if (this.show_code)
        //    return // code item should not be modified since that would erase the code
        if (mat3.exactEquals(v, this.v))
            return
        mat3.copy(this.v, v)
        if (dirtyify)
            this.pset_dirty()
    } 
    gl_set_value(loc) {
        gl.uniformMatrix3fv(loc, false, this.get_value())
    }    
}

class PointDial {
    constructor(on_move, on_start_drag=null) {
        this.on_move = on_move
        this.on_start_drag = on_start_drag || ( ()=>{return null} )
        this.zc = null
    }
    draw(x, y, obj_t_mat, m) {
        this.obj_t_mat = obj_t_mat
        let p = vec2.fromValues(x, y)
        vec2.transformMat3(p, p, obj_t_mat)
        vec2.transformMat3(p, p, m)

        const SZ = 10
        this.zc = {x:p[0]-SZ, y:p[1]-SZ, w:2*SZ, h:2*SZ}

        ctx_img.beginPath()
        closed_line(ctx_img, rect_coords(this.zc))
        double_line(ctx_img)
    }
    find_obj(ex, ey) {
        if (this.zc === null || !rect_hit(ex, ey, this.zc)) 
            return null
        const start_ctx = this.on_start_drag()
        return new DialMoveHandle(null, true, true, (dx, dy, e)=>{
            // dx,dy is not oriented with the object
            let iv = mat3.clone(this.obj_t_mat)
            iv[6] = 0; iv[7] = 0  // make a normals matrix to get the dv vector in the proper orientation. TBD good for shear?
            mat3.invert(iv, iv)
            let dv = vec2.fromValues(dx, dy)
            vec2.transformMat3(dv, dv, iv)
            this.on_move(dv[0], dv[1], start_ctx, e)  
        })
    }
}

class SizeDial extends PointDial {
    constructor(size_param) {
        super((dx, dy, ctx, e)=>{
            if (!e.shiftKey) {
                size_param.increment(vec2.fromValues(dx*2, dy*2))
            }
            else {  // if shift is pressed, maintain the ratio from when the mouse was pressed
                ctx.shadow_x = ctx.shadow_x + dx*2
                ctx.shadow_y = ctx.shadow_y + dy*2
                let nx, ny
                if (ctx.shadow_x < ctx.shadow_y) { // go by the minimum and calc the other one
                    nx = ctx.shadow_x
                    ny = nx * ctx.start_yx_ratio
                }
                else {
                    ny = ctx.shadow_y
                    nx = ny / ctx.start_yx_ratio
                }
                size_param.modify(vec2.fromValues(nx, ny))
            }
        }, ()=>{ // on start
            return { shadow_x: size_param.x, shadow_y: size_param.y, start_yx_ratio: (size_param.y/size_param.x) }
        })
        this.size_param = size_param
    }
    draw(transform, m) {
        //  /2 since size is the full object and we go from 0 to the corner
        super.draw(this.size_param.x/2, this.size_param.y/2, transform, m)
    }
}

class DialMoveHandle {
    constructor(param, do_x, do_y, callback=null) {
        this.param = param
        this.callback = callback
        this.do_x = do_x; this.do_y = do_y
    }
    mousedown() {}
    mouseup() {}
    mousemove(dx,dy, vx,vy, ex,ey, cvx, cvy, e) {
        dx /= image_view.viewport_zoom
        dy /= image_view.viewport_zoom        
        if (this.param !== null)
            this.param.move(this.do_x ? dx : 0, this.do_y ? dy: 0)
        else
            this.callback(this.do_x ? dx : 0, this.do_y ? dy: 0, e)
        trigger_frame_draw(true)
    }
}

class DialRotHandle {
    constructor(param, cx,cy) {
        this.param = param
        this.cx = cx; this.cy = cy
    }
    mousedown(e, vx,vy, ex,ey) {
        this.prev_angle = Math.atan2(ey-this.cy, ex-this.cx) * 180 / Math.PI
        //console.log("start-angle", this.start_angle, this.cx, this.cy, '--', vx, vy)
    }
    mouseup() {}
    mousemove(dx,dy, vx,vy, ex,ey) {
        let angle = Math.atan2(ey-this.cy, ex-this.cx) * 180 / Math.PI
        let d_angle = angle - this.prev_angle
        if (d_angle > 180) d_angle -= 360
        if (d_angle < -180) d_angle += 360
        //console.log("angle", angle - this.prev_angle, this.cx, this.cy, '--', ex, ey)
        this.param.do_rotate(d_angle)
        this.prev_angle = angle
        trigger_frame_draw(true)
    }
}

function closed_line(ctx, ln) {
    ctx.moveTo(ln[0], ln[1])
    for(let i = 2; i < ln.length; i += 2)
        ctx.lineTo(ln[i], ln[i+1])
    ctx.lineTo(ln[0], ln[1])
}

function double_line(ctx) {
    ctx.strokeStyle = '#ffff00'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.strokeStyle = '#ff0000'
    ctx.stroke()
}

const SQ_HALF = 0.70710678118

function rect_coords(c) {
    return [c.x,c.y, c.x+c.w,c.y, c.x+c.w,c.y+c.h, c.x,c.y+c.h]
}
function rect_hit(ex, ey, c) {
    return ex >= c.x && ey >= c.y && ex <= c.x + c.w && ey <= c.y + c.h
}

class TransformDial {
    constructor(param) {
        this.param = param
        this.cx = null; this.cy = null
        this.with_resize = false
    }
    set_center(cx, cy) { 
        this.cx = cx; this.cy = cy
        this.mv = {x:cx - 20, y:cy - 20, w:40, h:40}
        // up arrow
        this.uab = {x:this.cx-8, y:this.cy-25, bw:16, bh:20, tw:10, th:40} // bw=baseWidth, bh=baseHeight, tw=topWidth, th=topHeight
        // right arrow
        this.rab = {x:this.cx+25, y:this.cy-8, bw:16, bh:20, tw:10, th:40}
        this.rot = {r0:60, r1:75, a0:-0.4*Math.PI, a1:-0.1*Math.PI}
    }

    // called from image_find_obj
    find_obj(ex, ey) { // event coords
        let mv = this.mv, uab = this.uab, rab = this.rab, rot=this.rot
        if (rect_hit(ex, ey, mv))
            return new DialMoveHandle(this.param, true, true)
        if (ex >= uab.x && ex <= uab.x+uab.bw && ey >= uab.y-uab.th && ey <= uab.y)
            return new DialMoveHandle(this.param, false, true)
        if (ex >= rab.x && ex < rab.x+rab.th && ey >= rab.y && ey <= rab.y+rab.bw)
            return new DialMoveHandle(this.param, true, false)
        let tcx = ex-this.cx, tcy = ey-this.cy
        let de = Math.sqrt(tcx*tcx + tcy*tcy), ang = Math.atan2(ey-this.cy, ex-this.cx)
        if (de >= rot.r0 && de <= rot.r1 && ang >= rot.a0 && ang <= rot.a1)
            return new DialRotHandle(this.param, this.cx, this.cy)
        return null
    }
    // called from draw_selection
    draw() { 
        ctx_img.beginPath()
        // square
        const uab = this.uab, rab = this.rab, rot=this.rot
        closed_line(ctx_img, rect_coords(this.mv))
        // up arrow
        closed_line(ctx_img, [uab.x,uab.y, uab.x,uab.y-uab.bh, uab.x-uab.tw,uab.y-uab.bh, this.cx,uab.y-uab.th,
                              uab.x+uab.tw+uab.bw,uab.y-uab.bh, uab.x+uab.bw,uab.y-uab.bh, uab.x+uab.bw,uab.y])
        // right arrow
        closed_line(ctx_img, [rab.x,rab.y, rab.x+rab.bh,rab.y, rab.x+rab.bh,rab.y-rab.tw, rab.x+rab.th,this.cy,
                              rab.x+rab.bh,rab.y+rab.tw+rab.bw, rab.x+rab.bh,rab.y+rab.bw, rab.x,rab.y+rab.bw])
        // rotate circle
        ctx_img.moveTo(this.cx+rot.r1*Math.cos(rot.a0),this.cy+rot.r1*Math.sin(rot.a0))
        ctx_img.arc(this.cx,this.cy, rot.r0, rot.a0, rot.a1)
        ctx_img.arc(this.cx,this.cy, rot.r1, rot.a1, rot.a0, true)

        double_line(ctx_img)

    }
}

function cull_list(lst) {
    let newlst = new lst.constructor()
    for(let v of lst) 
        if (v !== undefined)
            newlst.push(v) // don't want a list with holes    
    return newlst
}

class ListParam extends Parameter {
    constructor(node, label, values_per_entry, in_table, lst_type, def_val=null) {
        super(node, label)
        //this.elem_prm = elem_prm
        this.values_per_entry = values_per_entry
        this.lst_type = lst_type
        this.lst = new lst_type()  // flat list
        this.elem_lst = null
        this.table = in_table
        this.column_key = in_table.register(this)  // columns are vertical, rows are horizontal
        this.def_val = (def_val !== null) ? def_val : get_default_value(label, values_per_entry) // kept here since it's the best place to keep it although it's not used by the class
        this.allow_title_edit = false
    }
    add_elems(parent) {}
    save() { return {lst:this.lst} }
    load(v) { 
        if (Array.isArray(this.lst)) // not a typed array
            this.lst = v.lst
        else
            this.lst = new this.lst_type(v.lst) 
    }

    get_def_val() {
        return this.def_val
    }

    add(v) { // for multiple lists in a table, needs to be called in the right order of the columns
        let av = v
        if (Array.isArray(v) || ArrayBuffer.isView(v) || typeof(v) == 'number') {
            if (v.length === undefined)  // support single value and list of values for vec
                av = [v]
            console.assert(av.length == this.values_per_entry, "Unexpected number of values")
            let newlst = new this.lst_type(this.lst.length + av.length)
            newlst.set(this.lst)
            newlst.set(av, this.lst.length)
            this.lst = newlst
        }
        else {
            this.lst.push(v)
        }
        this.pset_dirty(this.table === null) // if we're in a table, don't draw yet since not all the columns are set

        let vindex = (this.lst.length - this.values_per_entry)
        let col_elem = this.table.get_column_elem(this.column_key)
        if (col_elem !== null) // might not be displayed
            this.create_entry_elems(v, col_elem, vindex)
    }
    count() { return this.lst.length / this.values_per_entry }
    get_value(vindex) {
        dassert(vindex !== undefined, "unexpected vindex undefined")
        let v = []
        if (this.values_per_entry > 1)
            for(let vi = 0; vi < this.values_per_entry; ++vi)
                v[vi] = this.lst[vindex + vi]            
        else
            v = this.lst[vindex]
        return v
    }
    for_values(func) {
        for(let vindex = 0; vindex < this.lst.length; vindex += this.values_per_entry) {
            func(this.get_value(vindex), vindex)
        }
    }
    // called by ParamTable
    add_column_elems(column_elem) {
        this.elem_lst = []
        this.for_values((v, vindex)=>{ this.create_entry_elems(v, column_elem, vindex) })
    }
    // called by ParamTable
    get_column_title() {
        return this.label
    }
    set_column_title(v) {
        this.label = v
    }

    create_entry_elems(v, parent, vindex) {
        let e
        if (this.create_elem !== undefined) {
            let idx = vindex / this.values_per_entry
            e = this.create_elem(parent, v, idx, (v, ch_index, elem_idx=undefined) => {
                // change that come from the input element in the list
                let ch_vindex = ch_index * this.values_per_entry
                if (elem_idx === undefined) { // given a list
                    console.assert(v.length == this.values_per_entry, "unexpected length of value")
                    for(let vi = 0; vi < this.values_per_entry; ++vi)
                        this.lst[ch_vindex + vi] = v[vi]
                }
                else { // given just one number of a list
                    console.assert(v.length === undefined, "unexpected length existing")
                    this.lst[ch_vindex + elem_idx] = v
                }
                this.pset_dirty()
                trigger_frame_draw(true)
            }, 
            // get_cur_val
            (index)=>{ return this.get_value(index*this.values_per_entry) }) 
        }
        else {
            let clss = this.get_clss ? this.get_clss(vindex / this.values_per_entry) : [this.elem_prm.cls]
            e = create_div(clss)
            e.innerText = this.to_string(v)
            parent.appendChild(e)
        }
        this.elem_lst.push(e)
        return e
    }

    remove(index_lst) { // need to remove a list since the indices will change if we remove one by one
        let tmplst = Array.from(this.lst) // for removing put it in a normal array (can't remove from typed array or set to undefined in there)
        let tmplen = tmplst.length
        for(let index of index_lst) {
            let vindex = index * this.values_per_entry
            console.assert(vindex < this.lst.length, "remove out of range")
            for(let i = 0; i < this.values_per_entry; ++i)
                delete tmplst[vindex+i]
            tmplen -= this.values_per_entry
            if (this.elem_lst !== null) { // displayed even?
                this.elem_lst[index].remove() // remove from DOM tree
                delete this.elem_lst[index]  // make it undefined for later cull
            }
        }

        this.lst = new this.lst.constructor(tmplen)
        let addi = 0
        for(let v of tmplst) 
            if (v !== undefined)
                this.lst[addi++] = v
        this.pset_dirty()

        if (this.elem_lst !== null) {
            this.elem_lst = cull_list(this.elem_lst)
            this.reprint_all_lines()
            console.assert(this.lst.length == this.elem_lst.length * this.values_per_entry, "unexpected number of elements")
        }
    }
    clear() {
        this.lst = new this.lst.constructor()
        if (this.elem_lst !== null) // otherwise keep it null
            this.elem_lst = [] 
    }

    reprint_line(vidx, v) {
        if (this.elem_lst === null || this.elem_lst.length == 0)
            return // happens if the table is not visible (Gradient with function)
        let idx = vidx / this.values_per_entry
        let elem = this.elem_lst[idx]
        if (this.external_update) {
            this.external_update(elem, v, idx)
        }
        else {
            if (this.get_clss)
                elem.classList = this.get_clss(idx).join(" ")
            elem.innerText = this.to_string(v)
        }
    }

    reprint_all_lines() {  // voffset needed for gradient that has its list items shifted in index space
        this.for_values((v, vindex)=>{ this.reprint_line(vindex, v) })
    }

    // for changes that come from user interaction in the image canvas
    modify(index, v) { // index is already multiplied by values_per_entry
        if (this.values_per_entry > 1) {
            console.assert(v.length == this.values_per_entry, "Unexpected number of values")
            let vindex = index * this.values_per_entry
            console.assert(vindex < this.lst.length, "modify out of range")
            for(let vi = 0; vi < v.length; ++vi)
                this.lst[vindex + vi] = v[vi]
            this.reprint_line(vindex, v)
        }
        else {
            console.assert(v.length === undefined, "Unexpected list")
            this.lst[index] = v
            this.reprint_line(index, this.lst[index])
        }        
        this.pset_dirty()
    }
    increment(index, dv) {
        if (this.values_per_entry > 1) {
            console.assert(dv.length == this.values_per_entry, "Unexpected number of values")
            let vindex = index * this.values_per_entry
            console.assert(vindex < this.lst.length, "modify out of range")
            for(let vi = 0; vi < dv.length; ++vi) 
                this.lst[vindex + vi] += dv[vi]
            this.reprint_line(vindex, this.lst.slice(vindex, vindex + this.values_per_entry))
        }
        else {
            console.assert(v.length === undefined, "Unexpected list")
            this.lst[index] += dv
            this.reprint_line(index, this.lst[index])
        }
        this.pset_dirty()
    }    
}



// a list for a column for a numerical value with an editor that pops up when its clicked. for float and vec2
class ParamEditableValueList extends ListParam {
    constructor(node, label, table, lst_type, selected_indices, values_per_entry, changed_func_to_node=null) 
    {
        super(node, label, values_per_entry, table, lst_type)
        this.edit_wrap = null
        this.selected_indices = selected_indices
        this.changed_func_to_node = changed_func_to_node
    }

    external_update(text_elem, value, index) {
        let clss = "param_monospace param_lst_clickable"
        let mark_sel = false;
        if (this.selected_indices !== null) {
            if (this.selected_indices.includes_shifted !== undefined)
                mark_sel = this.selected_indices.includes_shifted(index) // see Gradient points
            else
                mark_sel = this.selected_indices.includes(index)
        }
        if (mark_sel)
            clss += " param_list_selected_line"
        text_elem.classList = clss
        text_elem.innerText = this.to_string(value)
        text_elem.p_lst_index = index // elem remembers it's index in the list for when its edited
    }

    create_elem(parent, start_val, index, change_func, get_cur_val) {
        let text_elem = add_div(parent, "") // create elem for a single cell in the column of this list
        this.external_update(text_elem, start_val, index)
        // handle click for edit
        myAddEventListener(text_elem, "click", ()=>{ // open input edits on click
            // index should not be used inside here becase removals might have changed this elem index. instead use the 
            // index saved in the text_elem which is kept up to date with removals
            let cur_val = get_cur_val(text_elem.p_lst_index)
            if (this.edit_wrap !== null) {
                this.edit_wrap.parentNode.removeChild(this.edit_wrap)
            }
            this.edit_wrap = create_div("param_lst_coord_edit_wrap")
            for(let i = 0; i < this.values_per_entry; ++i) {
                add_param_edit(this.edit_wrap, (this.values_per_entry == 1)?cur_val:cur_val[i], ED_FLOAT, (v)=> { 
                    change_func(v, text_elem.p_lst_index, i); // do the change in the lst
                    this.external_update(text_elem, get_cur_val(text_elem.p_lst_index), text_elem.p_lst_index) 
                    if (this.changed_func_to_node) // redo_sort in Gradient
                        this.changed_func_to_node()
                }, "param_lst_edit_popup_input", ()=>{ // Enter handler
                    this.dismiss_edit_wrap()
                })
            }
            stop_propogation_on("mousedown", this.edit_wrap)
            text_elem.parentNode.insertBefore(this.edit_wrap, text_elem.nextSibling) // re-parent
        })
        return text_elem
    }
    dismiss_edit_wrap() {
        if (this.edit_wrap === null)
            return
        this.edit_wrap.parentNode.removeChild(this.edit_wrap);   
        this.edit_wrap = null
    }
    reg_dismiss_edit_wrap() {
        param_reg_for_dismiss(()=>{ this.dismiss_edit_wrap() }) // needs to be here since the list is reset every add_elem
    }

    add_elems(parent) {
        super.add_elems(parent) 
        this.reg_dismiss_edit_wrap()
    }
}

window.ParamCoordList = class ParamCoordList extends ParamEditableValueList {
    constructor(node, label, table, selected_indices=null) {
        super(node, label, table, TVtxArr, selected_indices, 2)
        this.pneed_normalize = false  // not really needed for coordinates but just for remembering    
    }
    to_string(v)  { return "(" + v[0].toFixed(3) + "," + v[1].toFixed(3) + ")" }
}

window.ParamFloatList = class ParamFloatList extends ParamEditableValueList {
    constructor(node, label, table, selected_indices, changed_func_to_node=null) {
        super(node, label, table, Float32Array, selected_indices, 1, changed_func_to_node)
        this.pneed_normalize = false
    }
    to_string(v) { return v.toFixed(3) }
}

function uint8arr_to_color(arr) {
    return {r:arr[0], g:arr[1], b:arr[2], alpha:arr[3]/255, alphai:arr[3]}
}
function color_to_uint8arr(c) {
    return [c.r, c.g, c.b, c.alphai]
}
window.ParamColorList = class ParamColorList extends ListParam {
    constructor(node, label, table) {
        super(node, label, 4, table, TColorArr, DEFAULT_VTX_COLOR.arr)
        this.pneed_normalize = true
    }
    external_update(elem,value,index) { 
        elem.p_lst_index = index 
    } 
    create_elem(parent, start_val, index, changed_func) { 
        let wdiv = add_div(parent, "col_elem_wrap") // needed so that the input+canvas would be a in single elem for reorder on gradient
        let [col,elem,ce] = add_param_color(wdiv, uint8arr_to_color(start_val), "param_table_input_color", function(c) {
            changed_func(color_to_uint8arr(c), elem.p_lst_index)
        })
        elem.p_lst_index = index
        return elem
    }
}



class ParamTable extends Parameter {
    constructor(node, label, sorted_order=null) {
        super(node, label)
        this.list_params = {}  // registered ListParams, this is a map and not a list so that keys are allocated using next_key to facilitate erase without shifting
        this.elem_cols = null
        this.elem_visible = true  // for when we don't want to render the table because it's not visible (Gradient with function)
        this.with_index_column = false
        this.with_column_sep = true
        this.with_column_title = false // don't set this and with_index_column together

        this.sorted_order = sorted_order // list of the indices in the sorted order they are supposed to be displayed in
        this.title_edit_wrap = null // the div that wraps the edit input for the editable titles
        this.next_key = 0  // used for indexing columns
    }
    register(list_param) {
        const mykey = this.next_key++
        this.list_params[mykey] = list_param
        return mykey
    }
    get_column_elem(column_key) {
        if (this.elem_cols === null || !this.visible)
            return null
        console.assert(this.list_params[column_key] !== undefined, "column index too high")
        return this.elem_cols[column_key]
    }
    del_column(column_key) {
        delete this.list_params[column_key]
        if (this.elem_cols !== null)
            delete this.elem_cols[column_key]
    }

    save() { return null }
    load(v) { } 

    add_elems(parent) {
        this.line_elem = add_param_block(parent)
        if (this.with_index_column) {
            // if we have and index column add a standard label that will be flush with the index column
            add_param_label(this.line_elem, this.label)
        }
        else {
            // otherwise, add a title that will be left aligned
            this.label_elem = add_div(this.line_elem, "param_list_title")
            this.label_elem.innerText = this.label + ":"
        }
        this.table_elem = add_div(this.line_elem, "param_list_body")

        if (!this.visible)
            return

        this.make_table()
        this.reg_dismiss_title_edit()
    }

    remake_table() {
        if (this.line_elem === null || !this.visible)
            return
        this.table_elem = clear_elem(this.table_elem)
        this.make_table()
    }

    make_table() {
        this.elem_cols = {} // keys are the same as in list_params
        const column_clss = this.with_column_sep ? ["param_table_column", "param_table_col_line"] : "param_table_column"
        // index column (1., 2. etc)
        if (this.with_index_column && Object.keys(this.list_params).length > 0) {
            let column = create_div(column_clss)
            const len = Object.values(this.list_params)[0].count()  // checked above there's atleast one...
            for(let i = 0; i < len; ++i)
                add_div(column, 'param_lst_order_idx').innerText = i + "."
            this.table_elem.appendChild(column)
        }
        
        for(let lst_prm_key in this.list_params) {
            const lst_prm = this.list_params[lst_prm_key]
            let column = create_div(column_clss)
            this.elem_cols[lst_prm_key] = column
            lst_prm.add_column_elems(column)

            if (this.sorted_order !== null) { // sort by the given order if needed
                let unsorted = column
                column = create_div(column_clss)
                let childs_copy = []
                for(let c of unsorted.childNodes)
                    childs_copy.push(c)
                for(let from_idx of this.sorted_order) {
                    column.appendChild(childs_copy[from_idx])
                }
            }

           // const columnWrap = create_div("param_table_col_wrap")
            if (this.with_column_title)
                this.add_column_title(column, lst_prm)
            //columnWrap.appendChild(column)
            this.table_elem.appendChild(column)
            let grip = add_div(column, "param_table_grip")
            add_grip_handlers(grip, column)
        }
    }

    add_column_title(column, lst_prm) {
        const e = create_div("param_table_col_title")
        e.innerText = lst_prm.get_column_title()
        column.insertBefore(e, column.firstChild)
    
        if (!lst_prm.allow_title_edit)
            return        
        myAddEventListener(e, "click", ()=>{ // title edit
            if (this.title_edit_wrap !== null)
                this.title_edit_wrap.parentNode.removeChild(this.title_edit_wrap)
            this.title_edit_wrap = create_div("param_table_title_edit_wrap")
            add_param_edit(this.title_edit_wrap, lst_prm.get_column_title(), ED_STR, (v)=>{
                lst_prm.set_column_title(v)
                e.innerText = v  // directly change it instead of remaking the table
                this.pset_dirty()
            }, "param_table_title_edit_input", ()=>{ // enter handler
                this.dismiss_title_edit() //
            })
            this.title_edit_wrap.style.width = e.getBoundingClientRect().width + "px"
            stop_propogation_on("mousedown", this.title_edit_wrap) // allow user to click the edit box to edit
            column.insertBefore(this.title_edit_wrap, e.nextSibling)
        })
    }
    dismiss_title_edit() {
        if (this.title_edit_wrap === null)
            return
        this.title_edit_wrap.parentNode.removeChild(this.title_edit_wrap);   
        this.title_edit_wrap = null
    }
    reg_dismiss_title_edit() {
        param_reg_for_dismiss(()=>{ this.dismiss_title_edit() })
    }
}



function add_grip_handlers(grip, cell) {
    let startOffset = null;
    let column_width = null;

    add_move_handlers(grip, (dx, dy, pageX, pageY)=>{
        column_width = startOffset + pageX
        cell.style.width = column_width + "px"
    }, (pageX, pageY)=>{
        startOffset = parseFloat(window.getComputedStyle(cell)["width"]) - pageX;
    })
}

const AceRange = ace.require('ace/range').Range;

function create_code_dlg(parent, dlg_rect, title, start_v, change_func, visible_changed_func, opt)
{
    let editor = null
    const dlg = create_dialog(parent, title, true, dlg_rect, visible_changed_func, ()=>{
        if (editor) // first call inside create_dialog, before editor was created
            editor.resize()
    })
    dlg.elem.classList.add("dlg_size_shader_edit")
    const ed_elem = add_div(dlg.client, ["dlg_param_text_area"])
    editor = new Editor(ed_elem, start_v, change_func, opt)
    editor.dlg = dlg
    return editor
}

const EDITOR_MIN_HEIGHT = 35

class Editor
{
    constructor(line, start_v, change_func, opt)
    {
        this.elem_wrapper = add_div(line, "panel_param_editor_wrap") // needed so that the popout btn would have a parent        
        const ed_elem = add_div(this.elem_wrapper, "panel_param_text_area")

        this.elem = ed_elem  // moves from panel to dialog
        this.opt = opt
        this.parentElem = ed_elem.parentElement
        this.editor = ace.edit(ed_elem);
        this.editor.setShowPrintMargin(false)
        if (opt.lang == "glsl") {
            const GlslMode = ace.require("ace/mode/glsl").Mode;
            this.editor.session.setMode(new GlslMode());
        }
        this.editor.setTheme("ace/theme/tomorrow_night_bright");
        this.editor.setBehavioursEnabled(false) // no auto-pairing of brackets
        this.editor.commands.removeCommand('find');
        this.editor.setValue(start_v, 1) // 1: cursorPos end
        //editor.setHighlightGutterLine(true)

        this.editor.on("change", eventWrapper((e)=>{ 
            // added my hack into ace to indicate a change that comes from a remove that is part of an insert
            // in this case ace fires two event without allowing micro-tasks. this causes the second event draw to not happen since there's 
            // a draw in progress due to the first change and that causes the variables in the expr that was parsed the second time to not be resolved
            if (e.add_inf === "remove_in_insert")
                return
            change_func(this.editor.getValue())
        }), "editor-change")

        this.err_elem = add_div(ed_elem, "prm_text_err")
        this.err_elem.style.display = "none"
        this.err_elem_visible = false
        this.errors = null

        // show error only when on the line
        //  don't need event wrapper for this, don't want it to cause spurious draws
        this.editor.getSelection().on("changeCursor", ()=>{this.update_err_elem()})
        this.marker_ids = []
        this.show_errors()

        this.dlg = null
        this.popout_elems = null

        // panel resize
        this.ppgrip = add_div(this.elem_wrapper, "panel_param_editor_resize_grip")
        add_move_handlers(this.ppgrip, (dx, dy, pageX, pageY)=>{
            const curstyle = window.getComputedStyle(this.elem_wrapper)
            const newh = Math.max(parseInt(curstyle.height) + dy, EDITOR_MIN_HEIGHT)
            this.elem_wrapper.style.height = newh + "px"
            if (this.opt.dlg_rect_wrap !== undefined) {
                if (this.opt.dlg_rect_wrap.panel_rect === null)
                    this.opt.dlg_rect_wrap.panel_rect = { height: null }
                this.opt.dlg_rect_wrap.panel_rect.height = newh
            }
            this.editor.resize()
        })
        if (this.opt.dlg_rect_wrap !== undefined && this.opt.dlg_rect_wrap.panel_rect !== null)
            this.elem_wrapper.style.height = this.opt.dlg_rect_wrap.panel_rect.height + "px"

        if (opt.with_popout) {
            const [ein,btn,_dummy] = add_checkbox_btn(this.elem_wrapper, "[]", false, (v)=>{ 
                this.pop_out(v)
            })
            btn.classList.add("prm_code_popout_btn")
            this.popout_elems = {ein:ein, btn:btn}

            if (this.opt.dlg_rect_wrap !== undefined && this.opt.dlg_rect_wrap.dlg_rect !== null && this.opt.dlg_rect_wrap.dlg_rect.visible == true)
                this.pop_out(true)
        }
        

    }

    pop_out(out_v) {
        if (this.dlg === null) {
            this.dlg = create_dialog(this.parentElem, this.opt.dlg_title, true, this.opt.dlg_rect_wrap.dlg_rect, ()=>{ this.pop_out(false) }, ()=>{ this.resize() })
            this.dlg.elem.classList.add("dlg_size_shader_edit")
            this.opt.dlg_rect_wrap.dlg_rect = this.dlg.rect
            //this.dlg.ed_elem = add_div(this.dlg.client, ["dlg_param_text_area"])
        }
        if (out_v) {
            this.dlg.set_visible(true)
            this.dlg.client.appendChild(this.elem)
        }
        else {
            this.dlg.set_visible(false)
            this.parentElem.appendChild(this.elem)
        }

        this.elem.classList.toggle("dlg_param_text_area", out_v)
        this.elem.classList.toggle("panel_param_text_area", !out_v)

        this.elem_wrapper.classList.toggle("panel_param_ed_minimized", out_v)
        this.ppgrip.classList.toggle("panel_param_editor_resize_grip_hidden", out_v)
        
        this.popout_elems.btn.classList.toggle('prm_code_popout_btn', !out_v)
        this.popout_elems.btn.classList.toggle('prm_code_popin_btn', out_v)
        this.popout_elems.ein.checked = out_v

        this.editor.resize(true) // needs to be after all DOM changes
    }

    set_title(v) {
        if (this.dlg !== null)
            this.dlg.set_title(v)
        this.opt.dlg_title = v
    }

    update_err_elem()
    {
        const line = this.editor.getSelection().getCursor().row + 1
        if (this.errors !== null) {
            const e = this.errors[line]
            if (e !== undefined) {
                this.err_elem.innerText = e.text
                this.err_elem.style.display = ""
                this.err_elem_visible = true
                return
            }
        }
        if (this.err_elem_visible) {
            this.err_elem.innerText = ""
            this.err_elem.style.display = "none"
            this.err_elem_visible = false
        }
    }

    show_errors() { // from glsl
        for(let marker_id of this.marker_ids)
            this.editor.session.removeMarker(marker_id)
        if (this.errors === null || this.errors.length == 0) {
            //editor.session.setAnnotations([])
        }
        else {
            for(let eline in this.errors) {
                const e = this.errors[eline]
                e.row = eline-1 // line is 1 based
                e.type = "error"
                this.marker_ids.push(this.editor.session.addMarker( new AceRange(e.row, 0, e.row, 1), "editor_error_marker", "fullLine"))
            }
            //editor.session.setAnnotations(Object.values(this.errors))
        }
        this.update_err_elem()
    }
        
    set_errors(err_lst) { // list of {line:, text:}
        this.errors = err_lst
        this.show_errors()
    }

    set_value(v) {
        this.editor.setValue(v, 1)
    }

    show_err(err) { // from expr
        this.set_errors({[err.line]:{text:err.msg}})
    }
    clear_err() { // from expr
        this.set_errors({})
    }

    get_elem() { return this.elem }
    resize() { this.editor.resize() }
}

// used for glsl
class ParamTextBlock extends Parameter 
{
    constructor(node, label, start_v, change_func) {
        super(node, label)
        this.dlg = null

        this.text_input = null
        this.wrap_dlg_rect = {dlg_rect:null, panel_rect:null} // state of the dialog display
        this.v = start_v
        this.change_func = change_func
        node.register_rename_observer((name)=>{
            this.editor.set_title(this.title())
        })
        this.editor = null
        this.last_errors = null
        this.dlg_rect = null
    }
    save() { return { dlg_rect: this.dlg_rect, text:this.v } }
    load(v) { this.v = v.text; this.dlg_rect = v.dlg_rect;  } // dlg_rect saved only if text is saved
    
    title() { return this.owner.name + " - " + this.label.replace('\n', ' ') }

    set_text(v, do_draw=true) { // when calling this from run(), set to false to avoid endless loop of draws
        if (this.v === v)
            return
        this.v = v; 
        this.pset_dirty(do_draw); 
        this.call_change()

        if (this.editor !== null)
            this.editor.set_value(this.v)
    }

    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        this.label_elem = add_param_label(this.line_elem, this.label)

        this.editor = new Editor(this.line_elem, this.v, (v)=>{
            this.v = v
            this.pset_dirty(); 
            this.call_change() 
        }, {lang:"glsl", dlg_title:this.title(), dlg_rect_wrap:this.wrap_dlg_rect, with_popout:true});
        this.editor.set_errors(this.last_errors) 
    }

    set_errors(errors) {
        this.last_errors = errors
        if (this.editor !== null)
            this.editor.set_errors(errors)
    }
    get_errors() {
        return this.last_errors
    }
    
}


class ParamSelect extends Parameter
{
    // opts can be ["A", "B", "C"] or [["A",0.1], ["B", 0.2], ["C", 0.3]]
    constructor(node, label, selected_idx, opts, change_func=null) {
        super(node, label)
        if (Array.isArray(opts[0])) { // has values
            this.opts = []
            this.opt_vals = []
            for(let o of opts) {
                this.opts.push(o[0])
                this.opt_vals.push(o[1])
            }
        }
        else {
            this.opts = opts
            this.opt_vals = null
        }
        this.init_sel = selected_idx
        this.sel_idx = selected_idx
        this.change_func = change_func
    }

    save() { return { sel_str: this.opts[this.sel_idx] } }
    load(v) { 
        this.sel_idx = this.opts.indexOf(v.sel_str); 
        if (this.sel_idx === -1) // happens if the option name changed
            this.sel_idx = this.init_sel
    }
    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_combobox(this.line_elem, this.opts, this.sel_idx, (v)=>{ 
            this.sel_idx = v; 
            this.call_change()
            this.pset_dirty() 
        })
    }
    call_change() { // reimplemet this if this.v is not the value
        if (this.change_func) 
            this.change_func(this.sel_idx)
    }        
    get_sel_name() {
        return this.opts[this.sel_idx].toLowerCase() // low case more appropriate for values
    }
    get_sel_val() {
        if (this.opt_vals === null)
            return null
        return this.opt_vals[this.sel_idx]
    }
}


const MAGIC_HDR = 0x616263ff
const MIME_TYPE_LEN = 30
const MIME_TYPE_LEN_PX = 40

// imgur doesn't support anything not PNG or JPG so I hide the data ina png by simply concatenating it to its end
function encodeIntoPng(data_bin, mime_type)
{
    const len = data_bin.byteLength + 8 + MIME_TYPE_LEN_PX
    if (mime_type.length > MIME_TYPE_LEN)
        return null
    const width = 128
    const height = Math.round((len / width) / 3) + 2  // 3 bytes per pixel
    canvas_img_shadow.width = width
    canvas_img_shadow.height = height 
    const id = ctx_img_shadow.getImageData(0, 0, width, height)
    const dst = id.data
    const dv = new DataView(dst.buffer)
    dv.setUint32(0, MAGIC_HDR)
    dv.setUint32(4, (data_bin.byteLength << 8) | 0xff)
    let dst_i = 8, src_i = 0
    while(src_i < MIME_TYPE_LEN) {
        dst[dst_i++] = mime_type.charCodeAt(src_i++)
        if ((dst_i % 4) == 3)
            dst[dst_i++] = 0xff
    }
    const bin_len = data_bin.byteLength
    const src = new Uint8Array(data_bin)
    src_i = 0;
    while(src_i < bin_len) {
        dst[dst_i++] = src[src_i++]
        dst[dst_i++] = src[src_i++]
        dst[dst_i++] = src[src_i++]
        dst[dst_i++] = 0xff // don't mess with alpha, that messes the colors for some reason
    }
    ctx_img_shadow.putImageData(id, 0, 0)
    // to PNG
    const durl = canvas_img_shadow.toDataURL('image/png') // don't use toBlob since it's asyncronous
    const comma = durl.indexOf(',')
    const dbase = durl.substr(comma+1)
    const dbin = atob(dbase)

    const dlen = dbin.length;
    const bytes = new Uint8Array(dlen);
    for (let i = 0; i < dlen; i++) {
        bytes[i] = dbin.charCodeAt(i);
    }
    console.log("data-len=", len, " encodede-len=", dlen)
    return bytes
}

function tryDecodeFromPng(image)
{
    canvas_img_shadow.width = image.width
    canvas_img_shadow.height = image.height
    ctx_img_shadow.drawImage(image, 0, 0)
    const id = ctx_img_shadow.getImageData(0, 0, image.width, image.height)
    const dv = new DataView(id.data.buffer)
    const magic = dv.getUint32(0)
    if (magic !== MAGIC_HDR)
        return null
    const dlen = (dv.getUint32(4) >> 8) + MIME_TYPE_LEN
    //const dst = new Uint8Array(dlen)
    let dst = '';
    const src = id.data
    const src_len = src.byteLength
    let src_i = 8, dst_i = 0;
    let debug = ''
    while(dst_i < dlen) {
        //debug += src[src_i].toString(16) + ' ' + src[src_i+1].toString(16) + ' ' + src[src_i+2].toString(16) + ' '
        dst += String.fromCharCode(src[src_i++]); 
        dst += String.fromCharCode(src[src_i++]); 
        dst += String.fromCharCode(src[src_i++]); 
        ++src_i  // skip alpha
        dst_i += 3
    }
    let mime_type = dst.substr(0, MIME_TYPE_LEN)
    while (mime_type.charCodeAt(mime_type.length-1) == 0)
        mime_type = mime_type.substr(0, mime_type.length-1)
    dst = dst.substr(MIME_TYPE_LEN, dlen-MIME_TYPE_LEN) // might have added a 1 or 2 extra bytes
    const png_url = "data:" + mime_type + ";base64," + btoa(dst)

    return png_url
}
    

class ParamFileUpload extends Parameter
{
    constructor(node, label) {
        super(node, label)
        this.file = null // file from file input, null if file came from a url
        this.remote_url = null
        this.remote_url_elem = null
        this.upload_progress_elem = null
    }
    save() { return {rurl:this.remote_url} }
    load(v) { 
        this.remote_url = v.rurl 
        if (this.remote_url !== null && this.remote_url.trim() != "")
            this.load_url(this.remote_url)
    }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_upload_btn(this.line_elem, ["param_btn", "param_file_choose_btn"], "Choose File...", (in_file)=>{ 
            this.file = in_file
            filename_show.textContent = this.file.name 
            this.read_file(this.file, true, (file, url)=>{ this.load_url(url) })
            upload_btn.style.display = ""
            // pset_dirty() done only when everything is loaded
        })
        let upload_btn = add_push_btn(this.line_elem, "Upload", ()=>{ // onclick 
            this.read_file(this.file, false, (file, data)=> { this.upload_to_imgur(file.type, data)} ) 
        })
        let show_div = add_div(this.line_elem, "param_file_show_parent")
        let filename_show = add_div(show_div, "param_file_show")
        if (this.file !== null)
            filename_show.textContent = this.file.name
        else
            upload_btn.style.display = "none"
        this.upload_progress_elem = add_elem(show_div, "progress", "param_file_progress")
        this.upload_progress_elem.max = 100
        this.upload_progress_elem.value = 0

        let line2_elem = add_param_line(parent)
        add_param_label(line2_elem, "Url")
        this.remote_url_elem = add_param_edit(line2_elem, this.remote_url, ED_STR, (v)=>{ 
            this.remote_url = v; 
            this.file = null // the file in the file input is no longer relevant if we changed the url manually
            this.filename_show = ""
            this.load_url(v) 
        })
        this.remote_url_elem.classList.add("param_input_long")
    }

    read_file(file, asurl, onload) {
        let reader = new FileReader();
        reader.onload = (e)=>{
            onload(file, e.target.result)
        }
        reader.onerror = (e)=>{
            console.error(e)
        }
        if (asurl)
            reader.readAsDataURL(file);
        else
            reader.readAsArrayBuffer(file)
    }

    upload_to_imgur(file_type, data, is_second_try=false) {
        const req = new XMLHttpRequest();
        
        req.onload = ()=>{
            console.log(req.responseText)
            this.upload_progress_elem.style.display = "none"
            let re = JSON.parse(req.responseText)
            if (re.success != true || re.status != 200) {
                if (re.status === 400 && !is_second_try) { // can try to encode it as PNG
                    const encoded = encodeIntoPng(data, file_type)
                    this.upload_to_imgur("image/png", encoded, true)
                }
                console.error("Failed upload, " + re.status)
                return
            }
            this.remote_url = re.data.link
            this.remote_url_elem.value = this.remote_url
            save_state()
        }
        req.onprogress = (e)=>{
            if (e.total == 0)
                return
            let percentComplete = (e.loaded / e.total)*100; 
            this.upload_progress_elem.value = percentComplete
        }
        if (req.upload) // in chrome there's a different progress listener
            req.upload.onprogress = req.onprogress
        req.onerror = (e)=>{
            console.error("Failed req ", e)
            this.upload_progress_elem.style.display = "none"
        }
    
        this.upload_progress_elem.value = 0
        this.upload_progress_elem.style.display = "initial"

        req.open("POST", 'https://api.imgur.com/3/image', true)
        req.setRequestHeader("Authorization", "Client-ID 559401233d3e1e6")
        req.setRequestHeader("Accept", 'application/json')
        req.setRequestHeader("Content-Type", file_type)
        console.log("Uploading ", file_type, " len:", data.byteLength)
        req.send(data)
    }
    
}


class ParamImageUpload extends ParamFileUpload
{
    constructor(node, label) {
        super(node, label)
        this.image = null  
        this.ilast_error = null
    }
    load_url(url) {
        this.ilast_error = null
        this.image = null
        let newimage = new Image()
        myAddEventListener(newimage, "load", (e)=>{
            this.ilast_error = null
            const decoded_url = tryDecodeFromPng(newimage)
            if (decoded_url !== null) {
                newimage.src = decoded_url
                return
            }
            this.image = newimage
            this.pset_dirty()
        }, FLAG_DONT_SAVE)
        myAddEventListener(newimage, "error", (e)=>{
            this.ilast_error = "Failed download image from URL"
            console.error("Failed to download image", e)
            this.image = null
            this.pset_dirty() // trigger a draw that will show this error
        }, FLAG_DONT_SAVE)
        newimage.crossOrigin = ''
        newimage.src = url
        // first time after load will be an empty image but then the load even is going to refresh the display   
        // empty image is preferable to null since it can still pass through stuff
        // it will become null if there's an error which needs to be visible
        this.image = newimage 
    }

    get_image() {
        assert(this.image !== null, this.owner.cls, (this.ilast_error !== null) ? this.ilast_error : "Image not loaded yet")
        return this.image
    }
    try_get_image() {  // may return null
        return this.image
    }
}

// not really a parameter that holds a value. it's a button that shows in the parameters panel
class ParamButton extends Parameter 
{
    constructor(node, label, onclick) {
        super(node, label)
        this.onclick = onclick
    }
    save() { return null }
    load(v) { }
    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        if (!this.is_sharing_line_elem()) 
            add_param_label(this.line_elem, null)  // empty space
        add_push_btn(this.line_elem, this.label, this.onclick)
    }
}

// doesn't hold any data, just container of other parameters for order
class ParamGroup extends Parameter
{
    constructor(node, label) {
        super(node, label)
    }
    save() { return null }
    load(v) { }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.line_elem.classList.toggle('param_line_group', true)
    }
    update_elems() { // will still work (and do nothing visible) if the node is not selected
        // remove all previous children
        if (this.line_elem === null)
            return
        while (this.line_elem.firstChild) {
            this.line_elem.removeChild(this.line_elem.firstChild);
        }
        // re-add up to date children
        for(let p of this.owner.parameters) {
            if (p.group_param !== null && Object.is(p.group_param, this)) {
                p.add_elems(null) // will get their parent from the group they have set
                p.init_enable_visible()
            }
        }
        fix_label_lengths(this.owner.parameters)
    }
}

class ParamMenuBtn extends Parameter 
{
    constructor(node, label, opts, make_elem_func, set_selected_func, cls_menu, cls_item) {
        super(node, label)
        this.opts = opts
        this.make_elem_func = make_elem_func
        this.set_selected_func = set_selected_func
        this.cls_menu = cls_menu
        this.cls_item = cls_item

        this.menu_elem = null
    }
    save() { return null }
    load(v) {}

    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        if (!this.is_sharing_line_elem()) 
            add_param_label(this.line_elem, null) 
        const dismiss_menu = ()=>{
            if (this.menu_elem !== null) {
                this.menu_elem.parentElement.removeChild(this.menu_elem)
                this.menu_elem = null
            }
            ein.checked = false
        }
        const [ein,btn,_dummy] = add_checkbox_btn(this.line_elem, this.label, false, (v)=>{
            if (!v) {
                dismiss_menu()
                return
            }
            this.menu_elem = add_div(this.line_elem, this.cls_menu)
            this.menu_elem.style.top = btn.offsetTop + btn.offsetHeight + 2 + "px"
            this.menu_elem.style.left = btn.offsetLeft + "px"
            let idx = 0;
            for(let o of this.opts) {
                const img_div = add_div(this.menu_elem, this.cls_item)
                this.make_elem_func(o, img_div)
                const midx = idx
                myAddEventListener(img_div, "mousedown", ()=>{
                    this.set_selected_func(o, midx)
                    dismiss_menu()
                })
                ++idx;
            }
        })
        // prevent two calls to dismiss when pressing the button
        btn.addEventListener("mousedown", (ev)=>{ ev.stopPropagation() })
        param_reg_for_dismiss(()=>{dismiss_menu()})
    }
}


// not a proper combo-box, more line a combo-box of buttons, each with an image
class ParamImageSelectBtn extends ParamMenuBtn
{
    constructor(node, label, opts, get_img_func, set_selected_func) {
        super(node, label, opts, get_img_func, set_selected_func,
              "param_img_menu", "param_img_item")
    }
}


class ParamTextMenuBtn extends ParamMenuBtn
{
    constructor(node, label, opts, set_selected_func) {
        super(node, label, opts, (opt, parent)=>{
            parent.innerText = opt
        }, set_selected_func, "param_text_menu", "param_text_item")
    }
}

