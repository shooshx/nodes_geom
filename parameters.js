"use strict"

class Parameter
{
    constructor(node, label) {
        this.label = label
        this.label_elem = null  // use for changing the label 
        this.line_elem = null  // used for enable
        this.enable = true
        this.visible = true
        if (node !== null) // will be null in DispParams
            node.parameters.push(this)
        this.owner = node
        this.dirty = true  // was it changed since the last run?
        this.change_func = null
        this.shares_line_from = null
        this.group_param = null
    }
    set_label(text) {
        this.label = text
        if (this.label_elem !== null) // can be null if we call this before displaying elements
            this.label_elem.innerText = text
    }
    set_enable(v) {
        if (this.enable == v)
            return
        this.enable = v
        if (this.line_elem !== null)
            this.line_elem.classList.toggle("param_disabled", !this.enable)
    }
    set_visible(v) {
        if (this.visible == v)
            return
        this.visible = v
        if (this.line_elem !== null)
            this.line_elem.classList.toggle("param_invisible", !this.visible)
    }
    init_enable_visible() {
        if (this.line_elem !== null) {
            if (!this.enable)
                this.line_elem.classList.toggle("param_disabled", true)
            if (!this.visible)
                this.line_elem.classList.toggle("param_invisible", true)
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
    share_line_elem_from(param) {
        this.shares_line_from = param   
    }
    is_sharing_line_elem() {
        return this.shares_line_from !== null && this.shares_line_from.visible
    }
    set_group(group_param) {
        this.group_param = group_param
    }
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

function clear_elem_byid(id) {
    let e = document.getElementById(id)
    return clear_elem(e)
}
function clear_elem(e) {
    var cNode = e.cloneNode(false);
    e.parentNode.replaceChild(cNode, e);
    return cNode    
}

// list of callbacks that want to get a call
// in the current "add_elems"
let g_params_popups = [] 
function show_params_of(node) {
    // clear children
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

// display_values is held per-node and is a map of string to value
// disp_params is produced by the object and holds how to display the params and it's default value
function show_display_params(obj, disp_node) {
    let params = null
    if (disp_node && obj)
        params = obj.get_disp_params(disp_node.display_values) // sets defaults if needed
    let div_display_params = clear_elem_byid('div_display_params')
    if (obj === null || params === null || disp_node === null || disp_node !== selected_node)
        return
    for(let p of params) {
        if (p !== null && p.add_elems) // the params of a group is an aggregate of it's members, it's not going to have that. FrameBuffer has null disp_params
            p.add_elems(div_display_params)
    }
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
function add_param_line(parent, param=null) { 
    if (param !== null) {
        if (param.is_sharing_line_elem())
            return param.shares_line_from.line_elem
        // line_elem of the group may be null if the group is not displayed since it's an internal node    
        if (param.group_param !== null && param.group_param.line_elem !== null)
            parent = param.group_param.line_elem
    }
    return add_div(parent, 'param_line') 
}
function add_param_multiline(parent, param=null) { 
    if (param !== null) {
        if (param.shares_line_from)
            return param.shares_line_from.line_elem
        if (param.group_line_elem)
            parent = param.group_line_elem
    }    
    return add_div(parent, 'param_multi_line') 
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

function formatType(value, type) {
    const is_float = (type == ED_FLOAT || type == ED_FLOAT_OUT_ONLY)
    return is_float ? toFixedMag(value) : value
}

const ED_FLOAT=0
const ED_INT=1    // "not float" - not formatted as float
const ED_STR=2
const ED_FLOAT_OUT_ONLY=3
const ED_COLOR_EXPR=4 // used for expression type check

function add_param_edit(line, value, type, set_func, cls=null) {
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
    /*if (is_float) {
        myAddEventListener(e, "mousedown", function(ev) {
            console.log("~~", ev.buttons, ev.button)
        })
    }*/
    line.appendChild(e)
    return e
}
function add_param_slider(line, min_val, max_val, start_value, set_func) {
    const center = add_div(line, "slider_line")
    const fill = add_div(center, "slider_fill")
    const thumb = add_div(center, "slider_thumb")
    const cfg = { min_val: min_val, max_val: max_val, v: null } // v is always in range [0,1]
    const set_len = (len)=>{
        thumb.style.left = len + "px"
        fill.style.width = len + "px"
    }
    const r01_to_range = (v)=>{
        return v*(cfg.max_val - cfg.min_val) + cfg.min_val
    }
    const range_to_r01 = (exv)=>{
        return (exv - cfg.min_val)/(cfg.max_val - cfg.min_val)
    }
    const update = (value)=>{
        if (value === null) {
            thumb.classList.toggle('slider_thumb_disabled', true)
            return
        }
        thumb.classList.toggle('slider_thumb_disabled', false)
        const crect = center.getBoundingClientRect()
        cfg.v = range_to_r01(value)
        cfg.v = clamp(0, cfg.v, 1) // don't show the thumb outside the line, even though it's wrong
        set_len(cfg.v * crect.width)
    }    
    update(start_value)
    let dragging = false
    thumb.addEventListener("mousedown", (ev)=>{
        if (ev.buttons != 1)
            return
        dragging = true
    });
    myAddEventListener(document, "mousemove", (ev)=>{
        if (!dragging)
            return
        const crect = center.getBoundingClientRect()
        const nv = (ev.pageX - crect.left)/crect.width
        if (nv == cfg.v)
            return
        cfg.v = clamp(0, nv, 1)
        set_len(cfg.v * crect.width)
        const exv = r01_to_range(cfg.v)
        set_func(exv)
    })
    document.addEventListener("mouseup", (ev)=>{
        dragging = false
    })

    const update_range = (min,max)=>{
        let exv = r01_to_range(cfg.v)
        cfg.min_val = min; cfg.max_val = max        
        update(exv)
    }

    return { update: update, elem: center, update_range: update_range }
    // TBD refactor capture
}
function add_param_color(line, value, cls, set_func) {
    let e = document.createElement('input')
    e.className = cls
    line.appendChild(e) // must have parent
    let ce = ColorEditBox.create_at(e, 200, function(c) { set_func(c) }, {with_alpha:true, myAddEventListener:myAddEventListener}, value)
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
    return [ein, etext]
}
function add_push_btn(parent, label, onclick) {
    let btn = add_div(parent, "param_btn")
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
    return [ein, btn]
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


class ParamInt extends Parameter {
    constructor(node, label, start_v) {
        super(node, label)
        this.v = start_v
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_param_edit(this.line_elem, this.v, ED_INT, (v)=>{ this.v = parseInt(v); this.pset_dirty() }) // TBD enforce int with parsing
    }
    gl_set_value(loc) {
        gl.uniform1i(loc, this.v)
    }    
}

class ParamStr extends Parameter {
    constructor(node, label, start_v, change_func) {
        super(node, label)
        this.v = start_v
        this.change_func = change_func
    }
    save() { return {v:this.v}}
    load(v) { this.v = v.v }
    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        add_param_edit(this.line_elem, this.v, ED_STR, (v)=>{ 
            this.v = v; 
            this.call_change()
            this.pset_dirty() 
        }) 
    }
}

class ParamBool extends Parameter {
    constructor(node, label, start_v, change_func) {
        super(node, label)
        this.v = start_v
        this.change_func = change_func
        this.as_btn = false
    }
    display_as_btn(v) { this.as_btn = v }
    save() { return {v:this.v} }
    load(v) { this.v = v.v; this.call_change()  }
    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        if (!this.is_sharing_line_elem()) 
            add_param_label(this.line_elem, null) 
        let add_func = this.as_btn ? add_checkbox_btn : add_param_checkbox
        const [ein,label] = add_func(this.line_elem, this.label, this.v, (v) => { 
            this.v = v; 
            this.call_change()
            this.pset_dirty()
        })
        this.label_elem = label
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
    if (a.length !== b.length)
        return false
    for(let i = 0; i < a.length; ++i)
        if (a[i] !== b[i])
            return false;
    return true
}

// represents a single value (item in a single edit box) that can be an expression and everything it needs to do
class ExpressionItem {
    constructor(in_param, prop_name, prop_type, set_prop=null, get_prop=null, slider_range=null) {
        this.in_param = in_param
        this.prop_name = prop_name // name of property to set in the containing param ("v", "r")
        this.set_prop = (set_prop !== null) ? set_prop : (v)=>{ this.in_param[this.prop_name] = v }
        this.get_prop = (get_prop !== null) ? get_prop : ()=>{ return this.in_param[this.prop_name] }
        this.prop_type = prop_type  // constant like ED_FLOAT used for formatting the value
        this.elem = null
        this.e = null  // expression AST, can call eval() on this or null of the value is just a number
        this.se = "" + this.get_prop() // expression string
        this.last_error = null // string of the error if there was one or null
        this.need_inputs = null // map string names of the inputs needed, already verified that they exist to the ObjRef that needs filling
        this.err_elem = null
        this.slider_enabled = (slider_range !== null)
        this.slider_range = (this.slider_enabled) ? slider_range : [0,1]  // needs to be valid anyway
        this.slider = null // object returned by add_param_slider
        this.ctx_menu_elem = null // when the context menu is visible, otherwise null
    }
    save_to(r) { 
        r["se_" + this.prop_name] = this.se 
        r["sldrng_" + this.prop_name] = this.slider_range
        r["slden_" + this.prop_name] = this.slider_enabled
    }
    load(v) {
        let vk = v["se_" + this.prop_name]
        if (vk !== undefined && vk !== null) 
            this.peval(vk) 
        else {
            let lv = v[this.prop_name]
            console.assert(lv !== undefined, "failed load value")
            this.do_set_prop(lv)
        }
        let slden = v["slden_" + this.prop_name]
        if (slden !== undefined)
            this.slider_enabled = slden
        this.slider_range = v["sldrng_" + this.prop_name] || this.slider_range
    }
    do_set_prop(v) {
        if (this.slider !== null)
            this.slider.update(v) // slider needs to know if it's disabled or not, called on add_elem
        const ov = this.get_prop()
        if (this.prop_type == ED_COLOR_EXPR)
            if (arr_equals(v, ov))
                return false
        else
            if (v === ov)
                return false
        this.set_prop(v)
        return true
    }
    show_err() {
        //let edit_rect = this.elem.getBoundingClientRect(), line_rect = this.this.elem.parentElement.getBoundingClientRect()
        this.err_elem = create_div("param_edit_err_box")
        this.err_elem.innerText = this.last_error
        this.err_elem.style.left = Math.round(this.elem.offsetLeft) + "px"
        this.err_elem.style.top = Math.round(this.elem.offsetHeight) + "px"
        this.elem.parentElement.insertBefore(this.err_elem, this.elem.nextSibling)
    }
    eset_error(ex) {
        if (this.last_error !== null)
            return
        this.last_error = ex.message
        if (this.elem) {
            this.elem.classList.toggle("param_input_error", true)
            this.show_err()
        }
    }
    eclear_error() {
        if (this.last_error === null) 
            return
        this.last_error = null
        if (this.elem)
            this.elem.classList.toggle("param_input_error", false)
        if (this.err_elem) {
            this.err_elem.parentElement.removeChild(this.err_elem)
            this.err_elem = null
        }
    }
    peval(se) {
        this.se = se
        this.eclear_error()
        try {
            this.in_param.owner.state_access.reset_check()
            this.e = ExprParser.eval(se, this.in_param.owner.state_access)
            const type = this.e.check_type()
            if (this.prop_type == ED_COLOR_EXPR)
                eassert(type === TYPE_VEC3 || type === TYPE_VEC4, "Wrong type, expected a vector")
            else
                eassert(type === TYPE_NUM, "Wrong type, expected a number") 
        }
        catch(ex) { // TBD better show the error somewhere
            this.eset_error(ex)
            set_error(this.in_param.owner.cls, "Parameter expression error")
            return
        }
        // score determines if the expression depends on anything
        let expr_score = this.in_param.owner.state_access.score
        if (expr_score == EXPR_CONST) { // depends on anything?
            if (this.do_set_prop(this.e.eval()))
                this.in_param.pset_dirty() 
            if (this.e.is_decimal_num && this.e.is_decimal_num()) { // if we've just inputted a number without any expression, don't save the expression
                this.e = null 
                //this.se = null
            }
            this.need_inputs = null
        }
        else {
            this.do_set_prop(null) // it's dynamic so best if it doesn't have a proper value from before
            if ((expr_score & EXPR_NEED_INPUT) != 0) {
                this.need_inputs = this.in_param.owner.state_access.need_inputs
            }
            this.in_param.pset_dirty() // TBD maybe expression didn't change?
        }
        
    } 

    add_slider_mechanism(line) 
    {
        let disp_slider = (is_first)=> {
            if (this.slider_enabled && (this.slider == null || is_first)) {
                this.slider = add_param_slider(line, this.slider_range[0], this.slider_range[1], null, (v)=>{
                    this.set_to_const(v)
                    this.in_param.pset_dirty() 
                })
                this.peval(this.se) // this will set the slider position and enablement (but not do pset_dirty since nothing changed)
            }
            else if (!this.slider_enabled && this.slider != null) {
                this.slider.elem.parentNode.removeChild(this.slider.elem)
                this.slider = null
            }
        }
        disp_slider(true) // on first display, always add the element if enabled

        let update_range = ()=>{
            if (this.slider === null)
                return
            this.slider.update_range(this.slider_range[0], this.slider_range[1])
            save_state()
        }

        let dismiss_menu = ()=>{
            if (this.ctx_menu_elem) {
                this.ctx_menu_elem.parentNode.removeChild(this.ctx_menu_elem);   
                this.ctx_menu_elem = null
            }
        }
        myAddEventListener(line, "contextmenu", (e)=>{
            let enable_slider_checkbox = (parent)=>{ 
                let sld_line = add_div(parent, 'prm_slider_ctx_line')
                let [ein,etext] = add_param_checkbox(sld_line, "Slider", this.slider_enabled, (v)=>{ 
                    this.slider_enabled = v; disp_slider(false)
                    toggle_en(v)
                    save_state() // nothing else save the state since this is just a GUI change
                })
                //etext.classList.add('ctx_menu_opt')
                let min_line = add_div(parent, 'prm_slider_ctx_line')
                add_elem(min_line, 'SPAN', 'prm_slider_ctx_label').innerText = "Min:"
                add_param_edit(min_line, this.slider_range[0], ED_FLOAT, (v)=>{ this.slider_range[0]=v; update_range() })
                let max_line = add_div(parent, 'prm_slider_ctx_line')
                add_elem(max_line, 'SPAN', 'prm_slider_ctx_label').innerText = "Max:"
                add_param_edit(max_line, this.slider_range[1], ED_FLOAT, (v)=>{ this.slider_range[1]=v; update_range() })
                let toggle_en = (v)=>{
                    min_line.classList.toggle('param_disabled', !v)
                    max_line.classList.toggle('param_disabled', !v)
                }
                toggle_en(this.slider_enabled)
            } 
            this.ctx_menu_elem = open_context_menu([{cmake_elems: enable_slider_checkbox}], e.pageX, e.pageY, main_view, ()=>{ dismiss_menu() } )
            e.preventDefault()
        })
        param_reg_for_dismiss(()=>{dismiss_menu()})
    }

    // is_single_value is false for things like vec2 that have multiple values in the same line
    add_editbox(line, is_single_value) {
        let show_v, ed_type
        if (this.e != null && this.e !== undefined) {
            show_v = this.se; 
            ed_type = ED_STR
        } else {
            show_v = this.get_prop(); 
            ed_type = this.prop_type
        }
        this.elem = add_param_edit(line, show_v, (ed_type == ED_FLOAT)?ED_FLOAT_OUT_ONLY:ed_type, (se)=>{this.peval(se)})
        if (this.last_error !== null) {
            this.elem.classList.toggle("param_input_error", true)
            this.show_err()
        }

        if (is_single_value) {
            this.add_slider_mechanism(line)
        }

        return this.elem
    }
    set_to_const(v) {
        this.e = null 
        this.se = formatType(v, this.prop_type)
        this.need_inputs = null
        this.elem.value = this.se
        this.do_set_prop(v) // in color, need it the picker style to not be italic
    }
    dyn_eval() {
        this.eclear_error()
        if (this.e === null)  
            return this.get_prop()
        try {
            return this.e.eval() // the state_input was put there using the evaler before the call to here
        }
        catch(ex) {
            this.eset_error(ex)
            throw ex // will be caught by the node and node error set by caller          
        }
    }
    need_input_evaler(input_name) {
        if (this.need_inputs === undefined || this.need_inputs === null)
            return null
        let ev = this.need_inputs[input_name]
        if (ev === undefined)
            return null
        return ev
    }
    get_last_error() {
        return this.last_error
    }
}


class ParamBaseExpr extends Parameter {
    constructor(node, label, start_v, ed_type, slider_range) {
        super(node, label)
        this.v = start_v  // numerical value in case of const
        this.item = new ExpressionItem(this, "v", ed_type, null, null, slider_range)
    }
    save() { let r = { v:this.v }; this.item.save_to(r); return r }
    load(v) { this.item.load(v) }

    add_elems(parent) {
        this.line_elem = add_param_line(parent, this)
        this.label_elem = add_param_label(this.line_elem, this.label)

        let elem = this.item.add_editbox(this.line_elem, true)
    }

    dyn_eval(item_index) {
        console.assert(item_index == 0, "unexpected param item index")
        return this.item.dyn_eval()
    }
    need_input_evaler(input_name) {
        return this.item.need_input_evaler(input_name)
    }
    get_last_error() {
        return this.item.get_last_error()
    }
    modify(v) {
        this.item.set_to_const(v)
        this.pset_dirty()
    }

}

class ParamColorExpr extends ParamBaseExpr {
    constructor(node, label, start_v, slider_range=null) {
        super(node, label, start_v, ED_COLOR_EXPR, slider_range)
        this.item.peval(this.v)
    }
}
class ParamFloat extends ParamBaseExpr {
    constructor(node, label, start_v, slider_range=null) {
        super(node, label, start_v, ED_FLOAT, slider_range)
    }
    gl_set_value(loc) {
        gl.uniform1f(loc, this.v)
    }    
}



class ParamVec2 extends Parameter {
    constructor(node, label, start_x, start_y, long_form=false) {
        super(node, label)
        this.x = start_x
        this.item_x = new ExpressionItem(this, "x", ED_FLOAT)
        this.y = start_y
        this.item_y = new ExpressionItem(this, "y", ED_FLOAT)
        this.long_form = long_form
    }
    save() { let r = { x:this.x, y:this.y }; this.item_x.save_to(r); this.item_y.save_to(r); return r }
    load(v) { this.item_x.load(v); this.item_y.load(v) }
    add_elems(parent) {
        if (!this.long_form) {
            this.line_elem = add_param_line(parent, this)
            this.label_elem = add_param_label(this.line_elem, this.label)

            this.item_x.add_editbox(this.line_elem)
            this.item_y.add_editbox(this.line_elem)
        }
        else {
            this.line_elem = add_param_multiline(parent, this)
            let line_x = add_param_line(this.line_elem); add_param_label(line_x, "X", 'param_label_pre_indent')
            this.item_x.add_editbox(line_x, true)
            let line_y = add_param_line(this.line_elem); add_param_label(line_y, "Y", 'param_label_pre_indent')
            this.item_y.add_editbox(line_y, true)            
        }
    }
    get_value() {
        return [this.x, this.y]
    }
    increment(dv) {
        this.item_x.set_to_const(this.x + dv[0])
        this.item_y.set_to_const(this.y + dv[1])
        this.pset_dirty() 
    }
    dyn_eval(item_index) {
        if (item_index == 0)
            return this.item_x.dyn_eval()
        if (item_index == 1)
            return this.item_y.dyn_eval()
        eassert(false, "inaccessible item index " + item_index)
    }
    need_input_evaler(input_name) {
        // the first one that has it is good since all who has it have the same one (objref)
        return this.item_x.need_input_evaler(input_name) || this.item_y.need_input_evaler(input_name)
    }
    get_last_error() {
        return this.item_x.get_last_error() || this.item_y.get_last_error()
    }
    gl_set_value(loc) {
        gl.uniform2f(loc, this.x, this.y)
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
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        this.elem_x = add_param_edit(this.line_elem, this.x, ED_INT, (v) => { this.x = parseInt(v); this.pset_dirty() })
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
}


class ParamColor extends Parameter {
    constructor(node, label, start_c_str) {
        super(node, label)
        this.v = ColorPicker.parse_hex(start_c_str)
        this.item_r = new ExpressionItem(this, "r", ED_INT, (v)=>{ this.v.r=(v === null)?v:(v & 0xff); this.items_to_picker()}, ()=>{return this.v.r})
        this.item_g = new ExpressionItem(this, "g", ED_INT, (v)=>{ this.v.g=(v === null)?v:(v & 0xff); this.items_to_picker()}, ()=>{return this.v.g})
        this.item_b = new ExpressionItem(this, "b", ED_INT, (v)=>{ this.v.b=(v === null)?v:(v & 0xff); this.items_to_picker()}, ()=>{return this.v.b})
        this.item_alpha = new ExpressionItem(this, "alphai", ED_INT, (v)=>{
            this.v.alphai=v & 0xff; 
            this.v.alpha=(v==null)?null:((v&0xff)/255); 
            this.items_to_picker()
        }, ()=>{return this.v.alphai})
        this.picker = null
        this.picker_elem = null
    }
    items_to_picker() { //  if possible transfer the color from the items to the picker, otherwise, make an indication it's not possible
        if (this.v.r !== null && this.v.g !== null && this.v.b !== null && this.v.alphai !== null) {
            if (this.picker !== null) {
                this.picker.set_color(this.v, false)
                this.picker_elem.setAttribute("placeholder", "")
                this.picker_elem.classList.toggle("param_color_from_input", false)
            }
        }
        else {
            if (this.picker_elem) {
                this.picker_elem.classList.toggle("param_color_from_input", true)
                this.picker_elem.value = ""
                this.picker_elem.setAttribute("placeholder", "[from-input]")
            }
        }
    }
    save() { 
        //return (this.v !== null) ? this.v.hex : null 
        let r = {r:this.v.r, g:this.v.g, b:this.v.b, hex:this.v.hex, alpha:this.v.alpha, alphai:this.v.alphai }
        this.item_r.save_to(r); this.item_g.save_to(r); this.item_b.save_to(r); this.item_alpha.save_to(r)
        return r 
    }
    load(v) { 
        this.v = v 
        this.item_r.load(v); this.item_g.load(v); this.item_b.load(v); this.item_alpha.load(v);
    }
    add_elems(parent) {
        this.line_elem = add_param_multiline(parent)
        let line_picker = add_param_line(this.line_elem);
        this.label_elem = add_param_label(line_picker, this.label)
        let [v, elem, picker] = add_param_color(line_picker, this.v, 'param_input', (v)=>{ 
            if (this.v !== null && this.v.hex == v.hex) 
                return;
            if (v === null)
                this.v = null
            else {
                this.v = v.copy() // make a copy so that this.v will be different object than the internal object
                // from color picker to items
                this.item_r.set_to_const(this.v.r)
                this.item_g.set_to_const(this.v.g)
                this.item_b.set_to_const(this.v.b)
                this.item_alpha.set_to_const(this.v.alphai)
            }
            this.pset_dirty()
        })
        this.v = v; this.picker_elem = elem; this.picker = picker
        let line_r = add_param_line(this.line_elem); add_param_label(line_r, "Red", 'param_label_pre_indent')
        this.item_r.add_editbox(line_r, true)
        let line_g = add_param_line(this.line_elem); add_param_label(line_g, "Green", 'param_label_pre_indent')
        this.item_g.add_editbox(line_g, true)
        let line_b = add_param_line(this.line_elem); add_param_label(line_b, "Blue", 'param_label_pre_indent')
        this.item_b.add_editbox(line_b, true)
        let line_alpha = add_param_line(this.line_elem); add_param_label(line_alpha, "Alpha", 'param_label_pre_indent')
        this.item_alpha.add_editbox(line_alpha, true)       
        this.items_to_picker() 
    }
    dyn_eval(item_index) {
        switch(item_index) {
        case 0: return this.item_r.dyn_eval() & 0xff
        case 1: return this.item_g.dyn_eval() & 0xff
        case 2: return this.item_b.dyn_eval() & 0xff
        case 3: return this.item_alpha.dyn_eval() & 0xff
        }
        eassert(false, "inaccessible item index " + item_index)
    }
    need_input_evaler(input_name) {
        // the first one that has it is good since all who has it have the same one (objref)
        return this.item_r.need_input_evaler(input_name) || this.item_g.need_input_evaler(input_name) ||
               this.item_b.need_input_evaler(input_name) || this.item_alpha.need_input_evaler(input_name)
    }
    get_last_error() {
        return this.item_r.get_last_error() || this.item_g.get_last_error() || 
               this.item_b.get_last_error() || this.item_alpha.get_last_error()
    }       
}

// contains a text box that holds a piece of code that can modify 
// multiple variables (NOT USED)
class ParamCode extends Parameter
{
    constructor(node, label) {
        super(node, label)
        this.text = null
        this.input_elem = null
    }
    save() { return { text:this.text }}
    load(v) { this.text = v.text }
    add_elems(parent) {
        this.line_elem = add_param_line(parent);
        this.label_elem = add_param_label(this.line_elem, this.label)
        this.input_elem = add_elem(this.line_elem, "textarea", ["param_text_area","panel_param_text_area"])
        this.input_elem.spellcheck = false
        this.input_elem.rows = 6

    }

}


function toFixedMag(f) {
    if (Math.abs(f) < 1e-13)
        return "0"
    let af = Math.min(Math.round(Math.log10(Math.abs(f)))-2, -3)
    return f.toFixed(-af)
}


class ParamTransform extends Parameter {
    constructor(node, label) {
        super(node, label)
        this.translate = vec2.fromValues(0,0)
        this.rotate = 0
        this.scale = vec2.fromValues(1,1)
        this.v = mat3.create()
        this.rotate_pivot = vec2.fromValues(0,0)
        
        this.elems = {tx:null, ty:null, r:null, sx:null, sy:null, pvx:null, pvy:null }
        this.dial = null
    }
    save() { return {t:this.translate, r:this.rotate, s:this.scale, pv:this.rotate_pivot} }
    load(v) { 
        this.translate[0] = v.t[0]; this.translate[1] = v.t[1]; 
        this.rotate = v.r; 
        if (v.pv) { this.rotate_pivot[0] = v.pv[0]; this.rotate_pivot[1] = v.pv[1] }
        this.scale[0] = v.s[0]; this.scale[1] = v.s[1]; 
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
    calc_pivot_counter(dx, dy) {
        if (isNaN(dx) || isNaN(dy))
            return // parse failed, no change
        this.rotate_pivot[0] += dx
        this.rotate_pivot[1] += dy
        
        let tt = mat3.create()
        mat3.translate(tt, tt, vec2.fromValues(-dx,-dy))
        mat3.rotate(tt, tt, glm.toRadian(this.rotate))
        mat3.translate(tt, tt, vec2.fromValues(dx,dy))
        //mat3.invert(tt, tt)
        let dt = vec2.create()
        vec2.transformMat3(dt, dt, tt)
        this.translate[0] += dt[0]
        this.translate[1] += dt[1]
        this.repaint_elems()
        this.calc_mat()
    }
    add_elems(parent) { 
        this.line_elem = add_param_multiline(parent)
        add_elem(this.line_elem, "hr", "param_separator")
        let line_t = add_param_line(this.line_elem)
        add_param_label(line_t, "Translate")
        this.elems.tx = add_param_edit(line_t, this.translate[0], ED_FLOAT, (v)=>{ this.translate[0] = parseFloat(v); this.calc_mat() })
        this.elems.ty = add_param_edit(line_t, this.translate[1], ED_FLOAT, (v)=>{ this.translate[1] = parseFloat(v); this.calc_mat()})
        let line_r = add_param_line(this.line_elem)
        add_param_label(line_r, "Rotate")
        let line_pv = add_param_line(this.line_elem)
        add_param_label(line_pv, "Pivot")
        this.elems.pvx = add_param_edit(line_pv, this.rotate_pivot[0], ED_FLOAT, (v)=>{ let dx = parseFloat(v)-this.rotate_pivot[0]; this.calc_pivot_counter(dx, 0) })
        this.elems.pvy = add_param_edit(line_pv, this.rotate_pivot[1], ED_FLOAT, (v)=>{ let dy = parseFloat(v)-this.rotate_pivot[1]; this.calc_pivot_counter(0, dy) })

        this.elems.r = add_param_edit(line_r, this.rotate, ED_FLOAT, (v)=>{ this.rotate = parseFloat(v); this.calc_mat()})
        let line_s = add_param_line(this.line_elem)
        add_param_label(line_s, "Scale")
        this.elems.sx = add_param_edit(line_s, this.scale[0], ED_FLOAT, (v)=>{ this.scale[0] = parseFloat(v); this.calc_mat()})
        this.elems.sy = add_param_edit(line_s, this.scale[1], ED_FLOAT, (v)=>{ this.scale[1] = parseFloat(v); this.calc_mat()})
    }
    repaint_elems() {
        if (this.elems.tx === null) // not displayed yet
            return
        this.elems.tx.value = toFixedMag(this.translate[0])
        this.elems.ty.value = toFixedMag(this.translate[1])
        this.elems.r.value = toFixedMag(this.rotate)
        this.elems.sx.value = toFixedMag(this.scale[0])
        this.elems.sy.value = toFixedMag(this.scale[1])
    }
    move(dx, dy) {
        this.translate[0] += dx; 
        this.translate[1] += dy; 
        this.calc_mat(); 
        this.repaint_elems()
    }
    do_rotate(d_angle) {
        this.rotate += d_angle;
        if (this.rotate > 360)  this.rotate -= 360
        if (this.rotate < 0) this.rotate += 360
        this.calc_mat(); 
        this.repaint_elems()
    }
    set_scale(sx, sy) {
        this.scale[0] = sx
        this.scale[1] = sy
        this.calc_mat(); 
        this.repaint_elems()
    }
    draw_dial(cx, cy) {
        if (this.dial === null)
            this.dial = new TransformDial(this)
        this.dial.set_center(cx, cy)
        this.dial.draw()
        return this.dial
    }
    draw_dial_at_obj(obj, m) {
        if (obj === null)
            return // might be it's not connected so it doesn't have output
        let center;
        if (false) { // this was replaced with pivot thing. TBD - starting pivot should be the center of the bbox instead of 0,0
            let bbox = obj.get_bbox()
            center = vec2.fromValues((bbox.min_x + bbox.max_x) * 0.5, (bbox.min_y + bbox.max_y) * 0.5)
            //this.set_rotate_pivot(center[0], center[1])
        }
        center = vec2.clone(this.rotate_pivot)

        center[0] += this.translate[0]
        center[1] += this.translate[1]
        vec2.transformMat3(center, center, m) // to canvas coords
        this.draw_dial(center[0], center[1])        
    }
}

class DialMoveHandle {
    constructor(param, do_x, do_y) {
        this.param = param
        this.do_x = do_x; this.do_y = do_y
    }
    mousedown() {}
    mouseup() {}
    mousemove(dx,dy, vx,vy, ex,ey) {
        dx /= image_view.viewport_zoom
        dy /= image_view.viewport_zoom        
        this.param.move(this.do_x ? dx : 0, this.do_y ? dy: 0)
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

const SQ_HALF = 0.70710678118

class TransformDial {
    constructor(param, move_rect) {
        this.param = param
        this.cx = null; this.cy = null
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
    find_obj(ex, ey) { // event coords
        let mv = this.mv, uab = this.uab, rab = this.rab, rot=this.rot
        if (ex >= mv.x && ey >= mv.y && ex <= mv.x + mv.w && ey <= mv.y + mv.h)
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
    draw() {
        ctx_img.beginPath()
        // square
        let mv = this.mv, uab = this.uab, rab = this.rab, rot=this.rot
        closed_line(ctx_img, [mv.x,mv.y, mv.x+mv.w,mv.y, mv.x+mv.w,mv.y+mv.h, mv.x,mv.y+mv.h])
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

        ctx_img.strokeStyle = '#ffff00'
        ctx_img.lineWidth = 3
        ctx_img.stroke()
        ctx_img.lineWidth = 1
        ctx_img.strokeStyle = '#ff0000'
        ctx_img.stroke()
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
    constructor(node, label, values_per_entry, in_table, lst_type) {
        super(node, label)
        //this.elem_prm = elem_prm
        this.values_per_entry = values_per_entry
        this.lst_type = lst_type
        this.lst = new lst_type()  // flat list
        this.elem_lst = []
        this.table = in_table
        this.column = in_table.register(this)  // columns are vertical, rows are horizontal
    }
    add_elems(parent) {}
    save() { return {lst:this.lst} }
    load(v) { 
        if (Array.isArray(this.lst)) // not a typed array
            this.lst = v.lst
        else
            this.lst = new this.lst_type(v.lst) 
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
        let col_elem = this.table.get_column_elem(this.column)
        if (col_elem !== null) // might not be displayed
            this.create_entry_elems(v, col_elem, vindex)
    }
    count() { return this.lst.length / this.values_per_entry }
    get_value(vindex) {
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
    add_column_elems(column_elem) {
        this.elem_lst = []
        this.for_values((v, vindex)=>{ this.create_entry_elems(v, column_elem, vindex) })
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
            if (this.elem_lst.length > 0) { // displayed even?
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

        this.elem_lst = cull_list(this.elem_lst)
        this.reprint_all_lines()
        console.assert(this.lst.length == this.elem_lst.length * this.values_per_entry, "unexpected number of elements")
    }
    clear() {
        this.lst = new this.lst.constructor()
        this.elem_lst.length = 0
    }

    reprint_line(vidx, v) {
        if (this.elem_lst.length == 0)
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

    // for changes that come from user interaction in the image_canvas
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
        let mark_sel;
        if (this.selected_indices.includes_shifted !== undefined)
            mark_sel = this.selected_indices.includes_shifted(index) // see Gradient points
        else
            mark_sel = this.selected_indices.includes(index)
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
                }, "param_lst_edit_popup_input")
            }
            stop_propogation_on("mousedown", this.edit_wrap)
            // !!!TBD Enter dismiss
            text_elem.parentNode.insertBefore(this.edit_wrap, text_elem.nextSibling) // re-parent
        })
        return text_elem
    }

    add_elems(parent) {
        super.add_elems(parent)
        param_reg_for_dismiss(()=>{ 
            if (this.edit_wrap) { 
                this.edit_wrap.parentNode.removeChild(this.edit_wrap);   
                this.edit_wrap = null
            }
        })    
    }
}

class ParamCoordList extends ParamEditableValueList {
    constructor(node, label, table, selected_indices) {
        super(node, label, table, TVtxArr, selected_indices, 2)
        this.need_normalize = false  // not really needed for coordinates but just for remembering    
    }
    to_string(v)  { return "(" + v[0].toFixed(3) + "," + v[1].toFixed(3) + ")" }
    def_value() { return [0,0] }
}

class ParamFloatList extends ParamEditableValueList {
    constructor(node, label, table, selected_indices, changed_func_to_node=null) {
        super(node, label, table, Float32Array, selected_indices, 1, changed_func_to_node)
        this.need_normalize = false
    }
    to_string(v) { return v.toFixed(3) }
    def_value() { return 0; }
}

function uint8arr_to_color(arr) {
    return {r:arr[0], g:arr[1], b:arr[2], alpha:arr[3]/255}
}
function color_to_uint8arr(c) {
    return [c.r, c.g, c.b, c.alpha*255]
}
class ParamColorList extends ListParam {
    constructor(node, label, table, arr_type=TColorArr) {
        super(node, label, 4, table, TColorArr)
        this.need_normalize = true
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
    def_value() { return [0xcc, 0xcc, 0xcc, 0xff] }
}



class ParamTable extends Parameter {
    constructor(node, label, sorted_order=null) {
        super(node, label)
        this.list_params = []  // registered ListParams
        this.elem_cols = null
        this.elem_visible = true  // for when we don't want to render the table because it's not visible (Gradient with function)

        this.sorted_order = sorted_order // list of the indices in the sorted order they are supposed to be displayed in
    }
    register(list_param) {
        this.list_params.push(list_param)
        return this.list_params.length - 1
    }
    get_column_elem(column) {
        if (this.elem_cols === null || !this.visible)
            return null
        console.assert(column < this.elem_cols.length, "column index too high")
        return this.elem_cols[column]
    }
    save() { return null }
    load(v) { } 

    add_elems(parent) {
        this.line_elem = add_param_block(parent)
        this.label_elem = add_div(this.line_elem, "param_list_title")
        this.label_elem.innerText = this.label + ":"
        this.table_elem = add_div(this.line_elem, "param_list_body")

        if (!this.visible)
            return

        this.make_table()
    }

    remake_table() {
        if (this.line_elem === null || !this.visible)
            return
        this.table_elem = clear_elem(this.table_elem)
        this.make_table()
    }

    make_table() {
        this.elem_cols = []
        
        for(let lst_prm of this.list_params) {
            let column = create_div("param_table_column")
            this.elem_cols.push(column)
            lst_prm.add_column_elems(column)

            if (this.sorted_order !== null) { // sort by the given order if needed
                let unsorted = column
                column = create_div("param_table_column")
                let childs_copy = []
                for(let c of unsorted.childNodes)
                    childs_copy.push(c)
                for(let from_idx of this.sorted_order) {
                    column.appendChild(childs_copy[from_idx])
                }
            }

            this.table_elem.appendChild(column)
            let grip = add_div(column, "param_table_grip")
            add_grip_handlers(grip, column)
        }
    }
}


function add_grip_handlers(grip, cell) {
    var moving = false;
    var startOffset;
    var column_width;

    myAddEventListener(grip, 'mousedown', function(e) {
        moving = true;
        startOffset = parseFloat(window.getComputedStyle(cell)["width"]) - e.pageX;
    });
    myAddEventListener(document, 'mousemove', function(e) {
      if (moving) {
            column_width = startOffset + e.pageX
            cell.style.width = column_width + "px"
            e.preventDefault(); // prevent selection action from messing it up
      }
    });
    myAddEventListener(document, 'mouseup', function() {
        moving = false;
    });
}

// used for glsl
class ParamTextBlock extends Parameter 
{
    constructor(node, label, change_func) {
        super(node, label)
        this.dlg = null
        this.dlg_elem = null
        this.text_input = null
        this.dlg_rect = null
        this.text = ""
        this.change_func = change_func
        node.register_rename_observer((name)=>{
            this.dlg.set_title(this.title())
        })
    }
    save() { return { dlg_rect: this.dlg_rect, text:this.text } }
    load(v) { this.text = v.text; this.dlg_rect = v.dlg_rect;  }
    
    title() { return this.owner.name + " - " + this.label }
    set_text(v) { this.text = v; this.pset_dirty(); this.call_change() }

    add_elems(parent) {
        this.line_elem = add_param_line(parent)
        this.label_elem = add_param_label(this.line_elem, this.label)
        this.dlg = create_dialog(parent, this.title(), true, this.dlg_rect, (visible)=>{ edit_btn.checked = visible })
        this.dlg_elem = this.dlg.elem, this.dlg_rect = this.dlg.rect
        let [edit_btn, edit_disp] = add_checkbox_btn(this.line_elem, "Edit...", this.dlg.rect.visible, this.dlg.set_visible)

        this.text_input = add_elem(this.dlg_elem, "textarea", ["dlg_param_text_area","param_text_area"])
        this.text_input.spellcheck = false
        this.text_input.value = this.text
        myAddEventListener(this.text_input, "input", ()=>{ this.text = this.text_input.value; this.pset_dirty(); this.call_change() }) // TBD save and trigger draw after timeout
        //this.text_input.value = this.text        
    }

    
    call_change() { 
        if (this.change_func) 
            this.change_func(this.text)
    }    
}

class ParamSelect extends Parameter
{
    constructor(node, label, selected_idx, opts, change_func=null) {
        super(node, label)
        this.opts = opts
        this.sel_idx = selected_idx
        this.change_func = change_func
    }
    save() { return { sel_str: this.opts[this.sel_idx] } }
    load(v) { this.sel_idx = this.opts.indexOf(v.sel_str); }
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
        let fin = add_elem(this.line_elem, "input", "param_file_input")
        fin.type = "file"
        fin.id = "p_fl_" + g_input_ids++
        let btn = add_elem(this.line_elem, "label", ["param_btn", "param_file_choose_btn"])
        btn.innerText = "Choose File..."
        btn.setAttribute("for", fin.id)
        myAddEventListener(fin, "change", ()=>{ 
            this.file = fin.files[0]
            fin.value = "" // make the input forget about this file so that the same filename can be uploaded again
            filename_show.textContent = this.file.name 
            this.read_file(this.file, true, (file, url)=>{ this.load_url(url) })
            upload_btn.style.display = ""
            // pset_dirty() done only when everything is loaded
        })
        let upload_btn = add_push_btn(this.line_elem, "Upload", ()=>{ // onclick 
            this.read_file(this.file, false, (file, data)=> { this.upload_to_imgur(file, data)} ) 
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

    upload_to_imgur(file, data) {
        var req = new XMLHttpRequest();
        
        req.onload = ()=>{
            console.log(req.responseText)
            var re = JSON.parse(req.responseText)
            if (re.success != true || re.status != 200) {
                console.error("Failed upload, " + re.status)
                return
            }
            this.remote_url = re.data.link
            this.remote_url_elem.value = this.remote_url
            this.upload_progress_elem.style.display = "none"
            save_state()
        }
        req.onprogress = (e)=>{
            if (e.total == 0)
                return
            var percentComplete = (e.loaded / e.total)*100; 
            this.upload_progress_elem.value = percentComplete
        }
        if (req.upload) // in chrome there's a different progress listener
            req.upload.onprogress = req.onprogress
        req.onerror = (e)=>{
            console.error(e)
            this.upload_progress_elem.style.display = "none"
        }
    
        this.upload_progress_elem.value = 0
        this.upload_progress_elem.style.display = "initial"

        req.open("POST", 'https://api.imgur.com/3/image', true)
        req.setRequestHeader("Authorization", "Client-ID 559401233d3e1e6")
        req.setRequestHeader("Accept", 'application/json')
        req.setRequestHeader("Content-Type", file.type)
        req.send(data)
    }
    
}


class ParamImageUpload extends ParamFileUpload
{
    constructor(node, label) {
        super(node, label)
        this.image = null
        this.last_error = null
    }
    load_url(url) {
        this.last_error = null
        this.image = null
        let newimage = new Image()
        myAddEventListener(newimage, "load", (e)=>{
            this.image = newimage
            this.pset_dirty()
        })
        myAddEventListener(newimage, "error", (e)=>{
            this.last_error = "Failed download image from URL"
            console.error("Failed to download image", e)
            this.image = null
            this.pset_dirty() // trigger a draw that will show this error
        })
        newimage.crossOrigin = ''
        newimage.src = url
        this.image = newimage // first time it may not be there but then the load even is going to refresh the display   
    }

    get_image() {
        if (this.image === null && this.last_error !== null)
            assert(false, this.owner.cls, this.last_error)
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
        this.line_elem = add_param_line(parent)
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